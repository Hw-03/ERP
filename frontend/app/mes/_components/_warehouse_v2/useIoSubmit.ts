import { useRef, useState } from "react";
import { api, type IoDraftPayload } from "@/lib/api";
import { runPendingCommand } from "@/lib/pending-command-storage";
import { makeClientRequestId } from "@/lib/uuid";
import {
  getPendingIoDraftRequest,
  getPendingIoRequest,
  PendingIoRequestError,
  toIoSubmitRequest,
  type IoSubmitInput,
} from "./ioPendingRequest";

function executeRequest(request: IoDraftPayload) {
  return request.batch_id
    ? api.submitDraft(request.batch_id, request.requester_employee_id)
    : api.submit(request);
}

export function useIoSubmit(employeeId = "") {
  const [submitting, setSubmitting] = useState(false);
  const [, refreshPending] = useState(0);
  const inFlightRef = useRef(false);
  const pendingRequest = getPendingIoRequest(employeeId);
  const pendingDraftRequest = getPendingIoDraftRequest(employeeId);
  const hasPendingRequest = !!pendingRequest || !!pendingDraftRequest;

  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setSubmitting(true);
    try {
      return await work();
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  async function submit(payload: IoSubmitInput) {
    if (getPendingIoRequest(payload.employeeId) || getPendingIoDraftRequest(payload.employeeId)) {
      throw new PendingIoRequestError();
    }
    try {
      return await runPendingCommand(
        `i:${payload.employeeId}`,
        { ...toIoSubmitRequest(payload), client_request_id: makeClientRequestId() },
        executeRequest,
      );
    } catch (error) {
      if (getPendingIoRequest(payload.employeeId) || getPendingIoDraftRequest(payload.employeeId)) {
        throw new PendingIoRequestError();
      }
      throw error;
    } finally {
      refreshPending((revision) => revision + 1);
    }
  }

  async function recoverPending() {
    const request = getPendingIoRequest(employeeId);
    const draftRequest = getPendingIoDraftRequest(employeeId);
    if (!request && !draftRequest) return null;
    try {
      if (request) {
        const response = await runPendingCommand(`i:${employeeId}`, request, executeRequest);
        return { request, response };
      }
      const response = await api.submitDraft(draftRequest!.batchId, draftRequest!.employeeId);
      return { request: null, draftBatchId: draftRequest!.batchId, response };
    } catch (error) {
      if (getPendingIoRequest(employeeId) || getPendingIoDraftRequest(employeeId)) {
        throw new PendingIoRequestError();
      }
      throw error;
    } finally {
      refreshPending((revision) => revision + 1);
    }
  }

  const submitDraft = (batchId: string, payload: IoSubmitInput) => submit({ ...payload, batchId });
  return {
    submitting,
    run,
    submit,
    submitDraft,
    pendingRequest,
    pendingDraftRequest,
    hasPendingRequest,
    recoverPending,
  };
}
