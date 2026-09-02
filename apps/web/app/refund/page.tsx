"use client";
import ProtectedRoute from "@/components/ProtectedRoute";
// v1.1 Q6: 客户决议 Refund 不在 v1.1 scope, 仅占位 "under development"。
// 保留 RefundProcess 组件文件(便于 Phase 2 复用),  UI 替换为占位卡片;
// 后端 /api/refunds*  全部保留(可逆)。
import RefundPlaceholder from "@/views/RefundPlaceholder";
export default function Page() {
  return (
    <ProtectedRoute>
      <RefundPlaceholder />
    </ProtectedRoute>
  );
}
