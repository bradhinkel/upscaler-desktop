import { Engine, EngineCapabilities } from '../../shared/types';

/**
 * Manages engine lifecycle and provides access to the active engine.
 * v1 has exactly one engine (NcnnEngine). The abstraction exists so
 * a future PythonDiffusionEngine can be added without touching the
 * renderer or orchestrator.
 */
export class EngineManager {
  private engines: Map<string, Engine> = new Map();
  private activeEngineId: string | null = null;

  /** Register an engine. Does not initialize it. */
  register(engine: Engine): void {
    const id = engine.capabilities().id;
    this.engines.set(id, engine);
    if (!this.activeEngineId) {
      this.activeEngineId = id;
    }
  }

  /** Initialize the active engine. */
  async initialize(): Promise<void> {
    const engine = this.getActive();
    await engine.initialize();
  }

  /** Shut down all engines. */
  async shutdown(): Promise<void> {
    for (const engine of this.engines.values()) {
      if (engine.isReady()) {
        await engine.shutdown();
      }
    }
  }

  /** Get the active engine. Throws if none registered. */
  getActive(): Engine {
    if (!this.activeEngineId || !this.engines.has(this.activeEngineId)) {
      throw new Error('No engine registered');
    }
    return this.engines.get(this.activeEngineId)!;
  }

  /** List capabilities of all registered engines. */
  listEngines(): EngineCapabilities[] {
    return Array.from(this.engines.values()).map((e) => e.capabilities());
  }
}
