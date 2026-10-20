"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminSession } from "@/lib/auth/admin-session";
import { workReservationsApi } from "@/lib/api/work-reservations";
import type { AdminWorkReservationCancelPayload, AdminWorkReservationFilters } from "@/lib/api/types/work-reservations";
import { queryKeys } from "./keys";
import { invalidateWorkReservationQueries, shouldRefreshWorkReservations } from "./workReservationInvalidation";

/** 메뉴가 열린 동안만 조회하고 권한 세션 전환/퇴장 시 관리자 예약 캐시를 비운다. */
export function useAdminWorkReservations(filters: AdminWorkReservationFilters, selectedId: string) {
  const { pin } = useAdminSession();
  const client = useQueryClient();
  const [authorizedPin, setAuthorizedPin] = useState<string | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const busy = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const ready = Boolean(pin && authorizedPin === pin);
  useEffect(() => {
    void client.cancelQueries({ queryKey: queryKeys.admin.workReservationsAll });
    client.removeQueries({ queryKey: queryKeys.admin.workReservationsAll });
    setAuthorizedPin(pin);
    return () => {
      void client.cancelQueries({ queryKey: queryKeys.admin.workReservationsAll });
      client.removeQueries({ queryKey: queryKeys.admin.workReservationsAll });
    };
  }, [client, pin]);
  const list = useQuery({
    queryKey: queryKeys.admin.workReservations(filters),
    queryFn: ({ signal }) => workReservationsApi.listAdmin(filters, { signal }),
    enabled: ready, retry: false, staleTime: 0, gcTime: 0,
  });
  const detail = useQuery({
    queryKey: queryKeys.admin.workReservationDetail(selectedId),
    queryFn: ({ signal }) => workReservationsApi.getAdminDetail(selectedId, { signal }),
    enabled: ready && Boolean(selectedId), retry: false, staleTime: 0, gcTime: 0,
  });

  /** 자동 재시도 없이 화면에서 확인한 버전으로 한 번만 취소한다. */
  async function cancel(batchId: string, payload: AdminWorkReservationCancelPayload): Promise<void> {
    const reason = payload.reason.trim();
    if (!ready || !pinRef.current || pinRef.current !== authorizedPin) throw new Error("관리자 PIN을 다시 확인해 주세요.");
    if (busy.current) throw new Error("취소 처리 중입니다.");
    if (!reason || reason.length > 1000) throw new Error("취소 사유를 1~1000자로 입력해 주세요.");
    busy.current = true; setCancelling(true);
    try {
      await workReservationsApi.cancelAdmin(batchId, { ...payload, reason });
      await invalidateWorkReservationQueries(client);
    } catch (error) {
      if (shouldRefreshWorkReservations(error)) await invalidateWorkReservationQueries(client);
      throw error;
    } finally {
      busy.current = false; setCancelling(false);
    }
  }
  return { ready, list, detail, cancel, cancelling };
}
