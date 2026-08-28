export type AuditEvent = {
  id: string;
  type: "import" | "reconcile" | "export" | "correction";
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

const events: AuditEvent[] = [];

export function appendAuditEvent(type: AuditEvent["type"], metadata: AuditEvent["metadata"]): AuditEvent {
  const event = {
    id: crypto.randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    metadata
  };

  events.push(event);
  return event;
}

export function listAuditEvents(): AuditEvent[] {
  return [...events];
}
