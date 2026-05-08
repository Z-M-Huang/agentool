import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTaskCreate, taskCreate } from '../../src/task-create/index.js';
import { createTaskGet, taskGet } from '../../src/task-get/index.js';
import { createTaskUpdate, taskUpdate } from '../../src/task-update/index.js';
import { createTaskList, taskList } from '../../src/task-list/index.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const toolOpts = { toolCallId: 'test', messages: [] as never[] };

describe('task tools', () => {
  let dir: string;
  let tasksFile: string;
  let create: ReturnType<typeof createTaskCreate>;
  let get: ReturnType<typeof createTaskGet>;
  let update: ReturnType<typeof createTaskUpdate>;
  let list: ReturnType<typeof createTaskList>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'task-test-'));
    tasksFile = join(dir, 'tasks.json');
    create = createTaskCreate({ tasksFile });
    get = createTaskGet({ tasksFile });
    update = createTaskUpdate({ tasksFile });
    list = createTaskList({ tasksFile });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('default exports', () => {
    it('taskCreate exists and has execute', () => {
      expect(taskCreate).toBeDefined();
      expect(typeof taskCreate.execute).toBe('function');
    });

    it('taskGet exists and has execute', () => {
      expect(taskGet).toBeDefined();
      expect(typeof taskGet.execute).toBe('function');
    });

    it('taskUpdate exists and has execute', () => {
      expect(taskUpdate).toBeDefined();
      expect(typeof taskUpdate.execute).toBe('function');
    });

    it('taskList exists and has execute', () => {
      expect(taskList).toBeDefined();
      expect(typeof taskList.execute).toBe('function');
    });
  });

  describe('create + get lifecycle', () => {
    it('creates a task and retrieves it by id', async () => {
      const createResult = await create.execute(
        { subject: 'Test task', description: 'A test task' },
        toolOpts,
      );
      expect(createResult).toContain('Created task');
      expect(createResult).toContain('Subject: Test task');
      expect(createResult).toContain('Status: pending');

      const idMatch = createResult.match(/Created task (\w+)/);
      expect(idMatch).not.toBeNull();
      const id = idMatch![1];

      const getResult = await get.execute({ taskId: id }, toolOpts);
      expect(getResult).toContain(`ID: ${id}`);
      expect(getResult).toContain('Subject: Test task');
      expect(getResult).toContain('Description: A test task');
    });
  });

  describe('create with metadata', () => {
    it('includes metadata in created task', async () => {
      const result = await create.execute(
        { subject: 'Meta task', description: 'Has metadata', metadata: { priority: 'high' } },
        toolOpts,
      );
      expect(result).toContain('Created task');
      expect(result).toContain('Metadata:');
      expect(result).toContain('high');
    });
  });

  describe('list tasks', () => {
    it('lists all non-deleted tasks', async () => {
      await create.execute(
        { subject: 'Task A', description: 'First' },
        toolOpts,
      );
      await create.execute(
        { subject: 'Task B', description: 'Second' },
        toolOpts,
      );

      const result = await list.execute({}, toolOpts);
      expect(result).toContain('Task A');
      expect(result).toContain('Task B');
    });

    it('returns message when no tasks exist', async () => {
      const result = await list.execute({}, toolOpts);
      expect(result).toContain('No tasks found');
    });

    it('excludes deleted tasks from list', async () => {
      const createResult = await create.execute(
        { subject: 'Delete me', description: 'Will be deleted' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];
      await update.execute({ taskId: id, status: 'deleted' }, toolOpts);

      const result = await list.execute({}, toolOpts);
      expect(result).toContain('No tasks found');
    });

    it('includes owner and blocking details in summaries', async () => {
      const createResult = await create.execute(
        { subject: 'Listed task', description: 'Shows summary details' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];
      await update.execute(
        { taskId: id, owner: 'agent-1', addBlockedBy: ['dep-1'] },
        toolOpts,
      );

      const result = await list.execute({}, toolOpts);

      expect(result).toContain('(owner: agent-1)');
      expect(result).toContain('[blocked by dep-1]');
    });
  });

  describe('update', () => {
    it('updates task status', async () => {
      const createResult = await create.execute(
        { subject: 'Update me', description: 'Will be updated' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      const updateResult = await update.execute(
        { taskId: id, status: 'in_progress' },
        toolOpts,
      );
      expect(updateResult).toContain('Updated task');
      expect(updateResult).toContain('Status: in_progress');
    });

    it('updates owner and activeForm', async () => {
      const createResult = await create.execute(
        { subject: 'Owned task', description: 'Has owner' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      const result = await update.execute(
        { taskId: id, owner: 'agent-1', activeForm: 'Working on it' },
        toolOpts,
      );
      expect(result).toContain('Owner: agent-1');
      expect(result).toContain('Active: Working on it');
    });

    it('updates subject and description', async () => {
      const createResult = await create.execute(
        { subject: 'Old subject', description: 'Old description' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      const result = await update.execute(
        {
          taskId: id,
          subject: 'New subject',
          description: 'New description',
        },
        toolOpts,
      );

      expect(result).toContain('Subject: New subject');
      expect(result).toContain('Description: New description');
    });

    it('creates metadata when the existing task has none', async () => {
      const createResult = await create.execute(
        { subject: 'No metadata', description: 'Will get metadata' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      const result = await update.execute(
        { taskId: id, metadata: { priority: 'low' } },
        toolOpts,
      );

      expect(result).toContain('"priority":"low"');
    });

    it('merges metadata (null deletes key)', async () => {
      const createResult = await create.execute(
        { subject: 'Meta task', description: 'Test', metadata: { a: 1, b: 2 } },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      // Merge: add c, delete a
      await update.execute(
        { taskId: id, metadata: { c: 3, a: null } },
        toolOpts,
      );

      const getResult = await get.execute({ taskId: id }, toolOpts);
      expect(getResult).not.toContain('"a"');
      expect(getResult).toContain('"b"');
      expect(getResult).toContain('"c"');
    });

    it('appends to blocks and blockedBy without duplicates', async () => {
      const createResult = await create.execute(
        { subject: 'Blocked task', description: 'Test' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      await update.execute(
        { taskId: id, addBlocks: ['t1', 't2'], addBlockedBy: ['t3'] },
        toolOpts,
      );
      // Add duplicates — should not duplicate
      const result = await update.execute(
        { taskId: id, addBlocks: ['t1', 't4'], addBlockedBy: ['t3'] },
        toolOpts,
      );
      expect(result).toContain('Blocks: t1, t2, t4');
      expect(result).toContain('Blocked by: t3');
    });

    it('returns error for nonexistent task', async () => {
      const result = await update.execute(
        { taskId: 'nonexistent', subject: 'Updated' },
        toolOpts,
      );
      expect(result).toContain('Error [task-update]');
      expect(result).toContain('not found');
    });
  });

  describe('get validation', () => {
    it('returns error for nonexistent id', async () => {
      const result = await get.execute(
        { taskId: 'nonexistent' },
        toolOpts,
      );
      expect(result).toContain('Error [task-get]');
      expect(result).toContain('not found');
    });
  });

  describe('malformed task store handling', () => {
    it('returns a create error when the task file path is a directory', async () => {
      const badCreate = createTaskCreate({ tasksFile: dir });
      const result = await badCreate.execute(
        { subject: 'Bad path', description: 'Cannot save' },
        toolOpts,
      );

      expect(result).toContain('Error [task-create]');
    });

    it('returns a get error when stored task data is malformed', async () => {
      await writeFile(
        tasksFile,
        JSON.stringify([{ id: 'bad', subject: 'Bad task' }]),
      );

      const result = await get.execute({ taskId: 'bad' }, toolOpts);

      expect(result).toContain('Error [task-get]');
    });

    it('returns a list error when summary formatting fails', async () => {
      await writeFile(
        tasksFile,
        JSON.stringify([{ id: 'bad', status: 'pending', subject: 'Bad task' }]),
      );

      const result = await list.execute({}, toolOpts);

      expect(result).toContain('Error [task-list]');
    });

    it('returns an update error when updated malformed data cannot be formatted', async () => {
      await writeFile(
        tasksFile,
        JSON.stringify([{ id: 'bad', status: 'pending', subject: 'Bad task' }]),
      );

      const result = await update.execute(
        { taskId: 'bad', status: 'completed' },
        toolOpts,
      );

      expect(result).toContain('Error [task-update]');
    });
  });

  describe('status deleted', () => {
    it('supports deleted status', async () => {
      const createResult = await create.execute(
        { subject: 'Delete me', description: 'Will be deleted' },
        toolOpts,
      );
      const id = createResult.match(/Created task (\w+)/)![1];

      const result = await update.execute(
        { taskId: id, status: 'deleted' },
        toolOpts,
      );
      expect(result).toContain('Status: deleted');
    });
  });
});
