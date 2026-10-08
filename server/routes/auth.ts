import { Router } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/register', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: 'Nom, email et mot de passe requis' });
      return;
    }

    const existing = db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      res.status(400).json({ error: 'Cet email est déjà utilisé' });
      return;
    }

    const validRoles = ['admin', 'demarcheur'];
    const userRole = validRoles.includes(role) ? role : 'demarcheur';

    const hashedPassword = await hashPassword(password);
    const result = db.insert(users).values({
      name,
      email,
      password: hashedPassword,
      role: userRole,
    }).run();

    const user = db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users).where(eq(users.id, Number(result.lastInsertRowid))).get();

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

    const user = db.select().from(users).where(eq(users.email, email)).get();
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

router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const user = db.select().from(users).where(eq(users.id, req.user!.userId)).get();
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/users', authMiddleware, requireRole('admin'), (_req, res) => {
  try {
    const allUsers = db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).all();
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/users/:id', authMiddleware, requireRole('admin'), (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user!.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
      return;
    }
    db.delete(users).where(eq(users.id, id)).run();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/refresh', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const newToken = generateToken({
      userId: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    });
    res.json({ token: newToken });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
