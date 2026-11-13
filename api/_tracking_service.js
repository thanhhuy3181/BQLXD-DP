/**
 * tracking_service.js
 * Backend logic for tracking delta synchronization across AD, AwD and AwM.
 * Manages delta cell updates, soft row removals, and audit metadata.
 */

'use strict';

function getRecordKey(tab, row) {
  if (!row) return '';
  if (tab === 'progress') {
    return String(row.id_goi_thau || row.ma_goi_thau || row.ma_hm || row.stt || '');
  }
  if (tab === 'hd' || tab === 'contract') {
    return String(row.code || row.so_hd || row.ma_ccm || row.stt || '');
  }
  if (tab === 'hsmt') {
    return String(row.code || row.stt || '');
  }
  if (tab === 'payment') {
    return String(row.file_name || (row.ma_hd && row.loai_tt ? `${row.ma_hd}_${row.loai_tt}` : row.stt || ''));
  }
  return String(row.id || row.code || row.stt || '');
}

async function getTrackingDeltas(sql, project, tab) {
  try {
    const key = `tracking:${project}:${tab}`;
    const rows = await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
    return rows[0]?.value || {};
  } catch (_) {
    return {};
  }
}

async function saveTrackingDelta(sql, project, tab, recordKey, field, value, username) {
  const key = `tracking:${project}:${tab}`;
  let state = {};
  try {
    const rows = await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
    state = rows[0]?.value || {};
  } catch (_) {}
  
  if (!state[recordKey]) {
    state[recordKey] = { _updated_at: new Date().toISOString(), _updated_by: username };
  }
  state[recordKey][field] = value;
  state[recordKey]._updated_at = new Date().toISOString();
  state[recordKey]._updated_by = username;

  await sql`INSERT INTO bqlda_state (key, value, updated_at) 
            VALUES (${key}, ${JSON.stringify(state)}::jsonb, now()) 
            ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
  return state[recordKey];
}

async function removeTrackingRow(sql, project, tab, recordKey, username) {
  const key = `tracking:${project}:${tab}`;
  let state = {};
  try {
    const rows = await sql`SELECT value FROM bqlda_state WHERE key=${key}`;
    state = rows[0]?.value || {};
  } catch (_) {}

  state[recordKey] = { _deleted: true, _deleted_at: new Date().toISOString(), _deleted_by: username };

  await sql`INSERT INTO bqlda_state (key, value, updated_at) 
            VALUES (${key}, ${JSON.stringify(state)}::jsonb, now()) 
            ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
  return true;
}

function applyDeltasToRows(tab, rows, deltas) {
  if (!Array.isArray(rows) || !deltas || typeof deltas !== 'object') {
    return rows || [];
  }
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const key = getRecordKey(tab, r);
    const delta = deltas[key];
    if (delta && delta._deleted) {
      continue; // Filter out soft-deleted row
    }
    if (delta) {
      result.push({ ...r, ...delta });
    } else {
      result.push(r);
    }
  }
  return result;
}

module.exports = {
  getRecordKey,
  getTrackingDeltas,
  saveTrackingDelta,
  removeTrackingRow,
  applyDeltasToRows,
};
