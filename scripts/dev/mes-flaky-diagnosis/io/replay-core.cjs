"use strict";
const MAX_DISPATCH_ERROR_MS = 20;
const { BrowserTransportConditionError } = require("./browser-transport.cjs");

/** Resolve only explicit semantic references, never replace arbitrary UUID text. */
function resolve(value, state) {
  if (Array.isArray(value)) return value.map(entry => resolve(entry, state));
  if (!value || typeof value !== "object") return value;
  if (Object.keys(value).length === 1 && typeof value.$ref === "string") {
    let current = state;
    for (const key of value.$ref.split(".")) {
      if (current == null || !Object.hasOwn(current, key)) throw new Error("dependency_missing");
      current = current[key];
    }
    if (current === undefined || current === null) throw new Error("dependency_missing");
    return structuredClone(current);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry, state)]));
}

function deadline(anchorBodyCompleteMs, originalOffsetMs) {
  if (!Number.isFinite(anchorBodyCompleteMs) || !Number.isFinite(originalOffsetMs)) throw new Error("invalid_deadline");
  return anchorBodyCompleteMs + originalOffsetMs;
}

function dispatchGuard(deadlineMs, actualMs, clockUncertaintyMs = 0) {
  const error_ms = actualMs - deadlineMs;
  return { ok: Number.isFinite(error_ms) && Math.abs(error_ms) + clockUncertaintyMs <= MAX_DISPATCH_ERROR_MS, error_ms, clock_uncertainty_ms: clockUncertaintyMs };
}

/** A missing dependency at its original deadline is terminal; no waiting/retry. */
async function issue(spec, deadlineMs, state, now, transport, beforeDispatch = () => true) {
  const driver_call_ms = now();
  if (!dispatchGuard(deadlineMs, driver_call_ms).ok)
    return { id: spec.id, status: "CONDITION_NOT_MET", reason: "driver_deadline_missed", deadline_ms: deadlineMs, driver_call_ms };
  let request;
  try { request = resolve(spec, state); }
  catch { return { id: spec.id, status: "CONDITION_NOT_MET", reason: "dependency_missing", deadline_ms: deadlineMs, driver_call_ms }; }
  if (!beforeDispatch()) return { id: spec.id, status: "SKIPPED_AFTER_STOP", deadline_ms: deadlineMs, driver_call_ms };
  try {
    const response = await transport(request, { deadline_ms: deadlineMs, driver_call_ms });
    if (response?.skipped) return { id: spec.id, status: "SKIPPED_AFTER_STOP", deadline_ms: deadlineMs, driver_call_ms };
    return { id: spec.id, status: "RESPONSE", deadline_ms: deadlineMs, driver_call_ms, ...response };
  } catch (error) {
    if (error instanceof BrowserTransportConditionError)
      return { id: spec.id, status: "CONDITION_NOT_MET", reason: error.conditionReason, deadline_ms: deadlineMs, driver_call_ms,
        error: { type: error.name } };
    return { id: spec.id, status: "REQUEST_FAILED", deadline_ms: deadlineMs, driver_call_ms,
      error: { type: error.name, code: error.code, errno: error.errno, syscall: error.syscall } };
  }
}

/** Qualification requires both real client emission and independent Next receipt. */
function assess(expected, dispatches, receipts, upstreams = []) {
  const gaps = [];
  for (const row of expected) {
    const emitted = dispatches.filter(event => event.id === row.id);
    if (emitted.length !== 1) gaps.push({ id: row.id, reason: "dispatch_evidence_missing_or_ambiguous" });
    else if (!dispatchGuard(row.deadline_ms, emitted[0].actual_ms, emitted[0].clock_uncertainty_ms ?? 0).ok) gaps.push({ id: row.id, reason: "wire_deadline_missed" });
    const received = receipts.filter(event => event.id === row.id);
    if (received.length !== 1) gaps.push({ id: row.id, reason: "next_receipt_missing_or_ambiguous" });
    else if (!dispatchGuard(row.deadline_ms, Number(received[0].mono_ns) / 1e6, row.deadline_uncertainty_ms ?? 0).ok)
      gaps.push({ id: row.id, reason: "next_receipt_outside_20ms_actual_wire_not_proven" });
    if (upstreams.filter(event => event.id === row.id).length !== 1) gaps.push({ id: row.id, reason: "upstream_socket_missing_or_ambiguous" });
  }
  return { status: gaps.length ? "CONDITION_NOT_MET" : "UNREPRODUCED", gaps,
    interpretation: "Normal responses mean unreproduced only. Socket evidence is required for original CI attribution." };
}

/** Apply terminal conditions before naming the issued requests' qualification. */
function finalizeAssessment(observation, { conditionStopped, firstFailure, issued, planned }) {
  const qualification = conditionStopped || (!firstFailure && issued !== planned) ? "CONDITION_NOT_MET" : observation.status;
  const status = qualification !== "CONDITION_NOT_MET" && firstFailure ? "STOPPED_AT_FIRST_FAILURE" : qualification;
  return { ...observation, qualification, status };
}

/** New socket events may precede connect; finish/error/end carry the final tuple. */
function matchUpstreams(issued, observations) {
  const matched = [];
  for (const request of issued) {
    const rows = observations.filter(row => row.request_id === request.request_id && row.method === request.method && row.path === request.actual_path &&
      ["next.upstream.finish", "next.upstream.error", "next.upstream.response.end"].includes(row.event) &&
      Number(row.mono_ns) / 1e6 >= request.driver_call_ms - MAX_DISPATCH_ERROR_MS && Number(row.mono_ns) / 1e6 <= (request.body_complete_ms ?? Infinity));
    const complete = rows.filter(row => typeof row.local?.[0] === "string" && row.local?.[1] > 0 && typeof row.remote?.[0] === "string" && row.remote?.[1] === 8021 && row.upstream_connection != null);
    const connections = new Set(complete.map(row => JSON.stringify([row.pid, row.upstream_connection, row.local, row.remote])));
    if (connections.size !== 1 || complete.filter(row => row.event === "next.upstream.finish").length > 1) continue;
    const found = complete.find(row => row.event === "next.upstream.finish") ?? complete.find(row => row.event === "next.upstream.error") ?? complete[0];
    matched.push({ ...found, id: request.id });
  }
  return matched;
}

/** Linux Node hrtime timestamps share the host CLOCK_MONOTONIC domain. */
function matchReceipts(issued, receipts) {
  const used = new Set();
  const matches = [];
  for (const request of issued) {
    const indices = receipts.flatMap((receipt, i) => !used.has(i) && request.request_id && receipt.request_id === request.request_id && receipt.method === request.method &&
      receipt.path === request.actual_path && Number(receipt.mono_ns) / 1e6 >= request.driver_call_ms - MAX_DISPATCH_ERROR_MS &&
      Number(receipt.mono_ns) / 1e6 <= (request.body_complete_ms ?? Infinity) ? [i] : []);
    if (indices.length === 1) { const [index] = indices; used.add(index); matches.push({ ...receipts[index], id: request.id }); }
  }
  return matches;
}

function prefixReady(prefixIds, dispatches) {
  return prefixIds.every(id => dispatches.filter(row => row.id === id).length === 1);
}

module.exports = { resolve, deadline, dispatchGuard, issue, assess, finalizeAssessment, matchReceipts, matchUpstreams, prefixReady, MAX_DISPATCH_ERROR_MS };
