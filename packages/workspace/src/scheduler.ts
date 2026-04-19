import type { WorkspaceScheduledTask, WorkspaceTaskPriority } from "./types.ts";

const priorityOrder = [
  "active-input",
  "visible-dirty-tiles",
  "ai-stream",
  "search-index",
  "offscreen-layout",
] satisfies WorkspaceTaskPriority[];

export class WorkspaceScheduler {
  private readonly queues = new Map<WorkspaceTaskPriority, WorkspaceScheduledTask[]>(
    priorityOrder.map((priority) => [priority, []]),
  );

  schedule(task: WorkspaceScheduledTask): void {
    this.queues.get(task.priority)!.push(task);
  }

  flush(maxTasks = Number.POSITIVE_INFINITY): number {
    let completed = 0;
    for (const priority of priorityOrder) {
      const queue = this.queues.get(priority)!;
      while (queue.length > 0 && completed < maxTasks) {
        queue.shift()!.run();
        completed += 1;
      }
      if (completed >= maxTasks) {
        break;
      }
    }
    return completed;
  }

  size(priority?: WorkspaceTaskPriority): number {
    if (priority !== undefined) {
      return this.queues.get(priority)!.length;
    }
    return [...this.queues.values()].reduce((total, queue) => total + queue.length, 0);
  }
}

export function createWorkspaceScheduler(): WorkspaceScheduler {
  return new WorkspaceScheduler();
}
