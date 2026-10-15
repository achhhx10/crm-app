import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { parseId } from '../utils/paramId.js';

const router = Router();

router.post('/register', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Nom, email et mot de passe requis' });
      return;
    }

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = (await db.select().from(users).where(eq(users.email, normalizedEmail)))[0];
    if (existing) {
      res.status(400).json({ error: 'Cet email est déjà utilisé' });
      return;
    }

    const validRoles = ['admin', 'demarcheur'];
    const userRole = validRoles.includes(role) ? role : 'demarcheur';

    const hashedPassword = await hashPassword(password);
    const [user] = await db.insert(users).values({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: userRole,
    }).returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    res.json(user);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email et mot de passe requis' });
      return;
    }

    const user = (await db.select().from(users).where(eq(users.email, String(email).trim().toLowerCase())))[0];
    if (!user) {
      res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      return;
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Email ou mot de passe incorrect' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role || 'demarcheur',
    });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = (await db.select().from(users).where(eq(users.id, req.user!.userId)))[0];
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/users', authMiddleware, requireRole('admin'), async (_req, res) => {
  try {
    const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users);
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
      return;
    }
    const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Identifiant invalide' });
      return;
    }

    const target = (await db.select().from(users).where(eq(users.id, id)))[0];
    if (!target) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const { name, email, role, password } = req.body ?? {};
    const patch: Partial<typeof users.$inferInsert> = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        res.status(400).json({ error: 'Le nom ne peut pas être vide' });
        return;
      }
      patch.name = trimmed;
    }

    if (email !== undefined) {
      const normalized = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        res.status(400).json({ error: 'Email invalide' });
        return;
      }
      const clash = (await db.select().from(users)
        .where(and(eq(users.email, normalized), ne(users.id, id))))[0];
      if (clash) {
        res.status(400).json({ error: 'Cet email est déjà utilisé' });
        return;
      }
      patch.email = normalized;
    }

    if (role !== undefined) {
      if (!['admin', 'demarcheur'].includes(role)) {
        res.status(400).json({ error: 'Rôle invalide' });
        return;
      }
      // Locking yourself out of your own role would leave nobody able to manage users.
      if (id === req.user!.userId && role !== target.role) {
        res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
        return;
      }
      if (target.role === 'admin' && role !== 'admin') {
        const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
        if (admins.length <= 1) {
          res.status(400).json({ error: 'Impossible : il doit rester au moins un administrateur' });
          return;
        }
      }
      patch.role = role;
    }

    if (password !== undefined && password !== '') {
      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
        return;
      }
      patch.password = await hashPassword(password);
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'Aucune modification fournie' });
      return;
    }

    const [updated] = await db.update(users).set(patch).where(eq(users.id, id))
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

    res.json(updated);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/refresh', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Re-check the user still exists (a deleted user must not be able to refresh).
    const user = (await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, req.user!.userId)))[0];
    if (!user) {
      res.status(401).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    const newToken = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role || 'demarcheur',
    });
    res.json({ token: newToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
