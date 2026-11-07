// Comptes à envoyer en une écriture. Testé dans tests/batch.test.ts.

/**
 * Comptes à envoyer en une écriture, et ceux déjà envoyés par cet onglet :
 * une écriture par compte, pas par tweet. Un envoi perdu est retenté.
 */
export class Batch {
  private readonly sent = new Set<string>();
  private pending = new Set<string>();
  private readonly send: (handles: string[]) => Promise<unknown>;
  private readonly canSend: () => boolean;

  /** @param canSend faux : ce qui attend n'est plus à envoyer, voir flush */
  constructor(send: (handles: string[]) => Promise<unknown>, canSend: () => boolean) {
    this.send = send;
    this.canSend = canSend;
  }

  add(handle: string): void {
    if (!this.sent.has(handle)) this.pending.add(handle);
  }

  flush(): void {
    if (!this.pending.size) return;
    if (!this.canSend()) {
      this.pending.clear();
      return;
    }
    const batch = [...this.pending];
    this.pending = new Set();
    for (const handle of batch) this.sent.add(handle);
    void this.send(batch).catch(() => {
      for (const handle of batch) this.sent.delete(handle);
    });
  }

  /** Oublie les comptes envoyés hors de `handles` : ils pourront être renvoyés. */
  keepOnly(handles: ReadonlySet<string>): void {
    for (const handle of this.sent) if (!handles.has(handle)) this.sent.delete(handle);
  }
}
