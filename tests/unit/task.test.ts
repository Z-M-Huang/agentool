import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTask, task } from '../../src/task/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('task tool', () => {
  let dir: string;
  let tasksFile: string;
  let taskTool: ReturnType<typeof createTask>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'task-test-'));
    tasksFile = join(dir, 'tasks.json');
    taskTool = createTask({ tasksFile });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('default export', () => {
    it('exists and has an execute function', () => {
      expect(task).toBeDefined();
      expect(typeof task.execute).toBe('function');
    });
  });

  describe('create + get lifecycle', () => {
    it('creates a task and retrieves it by id', async () => {
      const createResult = await taskTool.execute(
        { action: 'create', subject: 'Test task', description: 'A test task' },
        toolOpts,
      );
      expect(createResult).toContain('Created task');
      expect(createResult).toContain('Subject: Test task');
      expect(createResult).toContain('Status: pending');

      // Extract the id from the output
      const idMatch = createResult.match(/Created task (\w+)/);
      expect(idMatch).not.toBeNull();
      const id = idMatch![1];

      const getResult = await taskTool.execute(
        { action: 'get', id },
        toolOpts,
      );
      expect(getResult).toContain(`ID: ${id}`);
      expect(getResult).toContain('Subject: Test task');
      expect(getResult).toContain('Description: A test task');
      expect(getResult).toContain('Created:');
      expect(getResult).toContain('Updated:');
    });
  });

  describe('list tasks', () => {
    it('lists all tasks', async () => {
      await taskTool.execute(
        { action: 'create', subject: 'Task A', description: 'First' },
        toolOpts,
      );
      await taskTool.execute(
        { action: 'create', subject: 'Task B', description: 'Second' },
        toolOpts,
      );

      const result = await taskTool.execute(
        { action: 'list' },
        toolOpts,
      );
      expect(result).toContain('Task A');
      expect(result).toContain('Task B');
    });

    it('returns message when no tasks exist', async () => {
      const result = await taskTool.execute(
        { action: 'list' },
        toolOpts,
      );
      expect(result).toContain('No tasks found');
    });
  });

  describe('update status', () => {
    it('updates task status', async () => {
      const createResult = await taskTool.execute(
        { action: 'create', subject: 'Update me', description: 'Will be updated' },
        toolOpts,
      );
      const idMatch = createResult.match(/Created task (\w+)/);
      const id = idMatch![1];

      const updateResult = await taskTool.execute(
        { action: 'update', id, status: 'in_progress' },
        toolOpts,
      );
      expect(updateResult).toContain('Updated task');
      expect(updateResult).toContain('Status: in_progress');
    });
  });

  describe('delete task', () => {
    it('deletes a task by id', async () => {
      const createResult = await taskTool.execute(
        { action: 'create', subject: 'Delete me', description: 'Will be deleted' },
        toolOpts,
      );
      const idMatch = createResult.match(/Created task (\w+)/);
      const id = idMatch![1];

      const deleteResult = await taskTool.execute(
        { action: 'delete', id },
        toolOpts,
      );
      expect(deleteResult).toContain(`Deleted task "${id}"`);

      const getResult = await taskTool.execute(
        { action: 'get', id },
        toolOpts,
      );
      expect(getResult).toContain('not found');
    });
  });

  describe('get nonexistent task', () => {
    it('returns error for nonexistent id', async () => {
      const result = await taskTool.execute(
        { action: 'get', id: 'nonexistent' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('not found');
    });
  });

  describe('create with custom status', () => {
    it('creates task with specified status', async () => {
      const result = await taskTool.execute(
        {
          action: 'create',
          subject: 'Urgent',
          description: 'Already started',
          status: 'in_progress',
        },
        toolOpts,
      );
      expect(result).toContain('Status: in_progress');
    });
  });

  describe('create validation', () => {
    it('requires subject for create', async () => {
      const result = await taskTool.execute(
        { action: 'create', description: 'No subject' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('Subject is required');
    });

    it('requires description for create', async () => {
      const result = await taskTool.execute(
        { action: 'create', subject: 'No desc' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('Description is required');
    });
  });

  describe('update validation', () => {
    it('requires id for update', async () => {
      const result = await taskTool.execute(
        { action: 'update', subject: 'New subject' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('ID is required');
    });

    it('returns error when updating nonexistent task', async () => {
      const result = await taskTool.execute(
        { action: 'update', id: 'nonexistent', subject: 'Updated' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('not found');
    });
  });

  describe('delete validation', () => {
    it('requires id for delete', async () => {
      const result = await taskTool.execute(
        { action: 'delete' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('ID is required');
    });

    it('returns error when deleting nonexistent task', async () => {
      const result = await taskTool.execute(
        { action: 'delete', id: 'nonexistent' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('not found');
    });
  });

  describe('get validation', () => {
    it('requires id for get', async () => {
      const result = await taskTool.execute(
        { action: 'get' },
        toolOpts,
      );
      expect(result).toContain('Error [task]');
      expect(result).toContain('ID is required');
    });
  });
});
