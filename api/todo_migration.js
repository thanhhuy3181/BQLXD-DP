'use strict';
const crypto = require('crypto');

function stableId(value) {
  const hex = crypto.createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Migration To do cũ từ `bqlda_state` (`awm:todo:${username}:${project}`) sang `bqlda_collaboration`.
 * - Coexistence: Không xoá dữ liệu cũ trong `bqlda_state`.
 * - Idempotent: Nếu đã tồn tại trong `bqlda_collaboration`, bỏ qua không ghi đè.
 * - Bảo toàn trạng thái: map open -> assigned, done -> done.
 */
async function migrateUserProjectTodos(sql, username, project, now = new Date().toISOString()) {
  const key = `awm:todo:${username}:${project}`;
  const rows = await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
  const legacyItems = rows[0]?.value;
  if (!Array.isArray(legacyItems) || !legacyItems.length) {
    return {migrated: 0, skipped: 0, total: 0};
  }

  let migratedCount = 0;
  let skippedCount = 0;

  for (const item of legacyItems) {
    if (!item || !item.title) {
      skippedCount++;
      continue;
    }
    const targetId = isUuid(item.id) ? item.id : stableId(`legacy_todo:${project}:${username}:${item.id || item.title}`);

    // Kiểm tra xem đã tồn tại trong bqlda_collaboration chưa
    const existing = await sql`SELECT id FROM bqlda_collaboration WHERE id=${targetId} AND project=${project}`;
    if (existing.length) {
      skippedCount++;
      continue;
    }

    const title = String(item.title).trim().slice(0, 180);
    const body = String(item.notes || '').trim().slice(0, 10000);
    const dueDate = typeof item.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.due_date) ? item.due_date : '';
    const priority = ['low', 'normal', 'high'].includes(item.priority) ? item.priority : 'normal';
    const isDone = item.status === 'done';
    const createdAt = item.created_at || now;
    const updatedAt = item.updated_at || now;

    const taskData = {
      id: targetId,
      kind: 'task',
      task_type: 'general',
      project,
      owner: username,
      title,
      body,
      construction: '',
      section: '',
      start_date: '',
      assignee: username,
      collaborators: [],
      reviewer: '',
      due_date: dueDate,
      original_due_date: dueDate,
      priority,
      status: isDone ? 'done' : 'assigned',
      progress: isDone ? 100 : 0,
      checklist: [],
      reports: [],
      tags: [],
      links: [],
      created_at: createdAt,
      updated_at: updatedAt,
      revision: 1,
      history: [
        {actor: username, action: 'migrated', at: now, detail: 'Chuyển đổi từ dữ liệu To do cá nhân cũ'}
      ]
    };

    if (isDone) {
      taskData.completed_at = updatedAt;
    }

    await sql`INSERT INTO bqlda_collaboration(id, kind, project, owner, revision, data, created_at, updated_at)
      VALUES(${targetId}, 'task', ${project}, ${username}, 1, ${JSON.stringify(taskData)}::jsonb, ${createdAt}::timestamptz, ${updatedAt}::timestamptz)
      ON CONFLICT(id) DO NOTHING`;

    migratedCount++;
  }

  return {migrated: migratedCount, skipped: skippedCount, total: legacyItems.length};
}

module.exports = {
  migrateUserProjectTodos,
  stableId,
  isUuid
};
