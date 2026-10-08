import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { STAGES } from '../lib/utils';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../components/ui/toast';

interface PipelineContact {
  id: number;
  businessName: string;
  contactName: string | null;
  stage: string | null;
  phone: string | null;
}

const stageOrder = ['identifie', 'contacte', 'interesse', 'rdv_programme', 'proposition_envoyee', 'signe', 'perdu'];

export function PipelinePage() {
  const [pipelineData, setPipelineData] = useState<Record<string, PipelineContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [draggedContact, setDraggedContact] = useState<PipelineContact | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPipeline();
  }, []);

  const loadPipeline = async () => {
    try {
      const { contacts } = await api.contacts.list({ stage: 'all', limit: '1000' });
      const grouped: Record<string, PipelineContact[]> = {};
      stageOrder.forEach(s => grouped[s] = []);
      contacts.forEach((c: PipelineContact) => {
        const stage = c.stage || 'identifie';
        if (!grouped[stage]) grouped[stage] = [];
        grouped[stage].push(c);
      });
      setPipelineData(grouped);
    } catch (err) {
      console.error('Pipeline load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, contact: PipelineContact) => {
    setDraggedContact(contact);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(contact.id));
  };

  const handleDragEnd = () => {
    setDraggedContact(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);

    if (!draggedContact || draggedContact.stage === targetStage) {
      setDraggedContact(null);
      return;
    }

    const oldStage = draggedContact.stage || 'identifie';
    const contactId = draggedContact.id;

    setPipelineData(prev => {
      const next = { ...prev };
      next[oldStage] = (next[oldStage] || []).filter(c => c.id !== contactId);
      next[targetStage] = [...(next[targetStage] || []), { ...draggedContact, stage: targetStage }];
      return next;
    });

    setDraggedContact(null);

    try {
      await api.contacts.update(contactId, { stage: targetStage });
    } catch (err) {
      console.error('Erreur lors du déplacement:', err);
      setPipelineData(prev => {
        const next = { ...prev };
        next[targetStage] = (next[targetStage] || []).filter(c => c.id !== contactId);
        next[oldStage] = [...(next[oldStage] || []), draggedContact!];
        return next;
      });
    }
  };

  const handleMoveStage = async (contact: PipelineContact, newStage: string) => {
    const oldStage = contact.stage || 'identifie';

    // Optimistic update
    setPipelineData(prev => {
      const next = { ...prev };
      next[oldStage] = (next[oldStage] || []).filter(c => c.id !== contact.id);
      next[newStage] = [...(next[newStage] || []), { ...contact, stage: newStage }];
      return next;
    });

    try {
      await api.contacts.update(contact.id, { stage: newStage });
      toast(`Déplacé vers "${STAGES[newStage]?.label}"`, 'success');
    } catch (err) {
      toast('Erreur lors du déplacement', 'error');
      // Rollback
      setPipelineData(prev => {
        const next = { ...prev };
        next[newStage] = (next[newStage] || []).filter(c => c.id !== contact.id);
        next[oldStage] = [...(next[oldStage] || []), contact];
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stageOrder.map((stage) => {
          const stageInfo = STAGES[stage];
          const contacts = pipelineData[stage] || [];
          const isDragOver = dragOverStage === stage;

          return (
            <div key={stage} className="min-w-[280px] flex-shrink-0">
              <Card
                className={`h-full transition-colors ${
                  isDragOver ? 'border-primary border-2 bg-primary/5' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {stageInfo?.label || stage}
                    </CardTitle>
                    <Badge variant="secondary">{contacts.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {contacts.map((contact) => (
                      <Link
                        key={contact.id}
                        to={`/contacts/${contact.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, contact)}
                        onDragEnd={handleDragEnd}
                        className={`block p-3 rounded-lg border bg-background transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover cursor-grab active:cursor-grabbing dark:hover:shadow-card-dark-hover ${
                          draggedContact?.id === contact.id ? 'dragging' : ''
                        }`}
                      >
                        <p className="text-sm font-medium">{contact.businessName}</p>
                        {contact.contactName && (
                          <p className="text-xs text-muted-foreground mt-1">{contact.contactName}</p>
                        )}
                        {contact.phone && (
                          <p className="text-xs text-muted-foreground">{contact.phone}</p>
                        )}
                        {(() => {
                          const prevStageIndex = stageOrder.indexOf(stage) - 1;
                          const nextStageIndex = stageOrder.indexOf(stage) + 1;
                          const prevStage = prevStageIndex >= 0 ? stageOrder[prevStageIndex] : null;
                          const nextStage = nextStageIndex < stageOrder.length ? stageOrder[nextStageIndex] : null;
                          return (
                            <div className="flex items-center gap-1 mt-2">
                              {prevStage && (
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMoveStage(contact, prevStage); }}
                                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded bg-muted text-xs transition-colors hover:bg-muted/80 active:scale-[0.98]"
                                  title={`Déplacer vers ${STAGES[prevStage]?.label}`}
                                  aria-label={`Déplacer vers ${STAGES[prevStage]?.label}`}
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                              )}
                              {nextStage && (
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMoveStage(contact, nextStage); }}
                                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded bg-muted text-xs transition-colors hover:bg-muted/80 active:scale-[0.98]"
                                  title={`Déplacer vers ${STAGES[nextStage]?.label}`}
                                  aria-label={`Déplacer vers ${STAGES[nextStage]?.label}`}
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </Link>
                    ))}
                    {contacts.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Aucun prospect
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
