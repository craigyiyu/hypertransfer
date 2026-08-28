/**
 * test-setup.ts — Vitest 全局测试 setup。
 * 引入 @testing-library/jest-dom 的匹配器(toBeVisible 等)。
 * 迁移到 Next.js monorepo 后,页面渲染测试需要 mock next/navigation 与 next/link
 * (wouter shim 内部依赖它们)。
 */
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import React from "react";

// Node's experimental localStorage can shadow JSDOM's implementation without
// providing a usable Storage object. Keep browser-facing tests deterministic.
const localStorageValues = new Map<string, string>();
const localStorageStub: Storage = {
  get length() {
    return localStorageValues.size;
  },
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => [...localStorageValues.keys()][index] ?? null,
  removeItem: (key) => localStorageValues.delete(key),
  setItem: (key, value) => localStorageValues.set(key, String(value)),
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageStub,
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: React.ReactNode; className?: string }) =>
    React.createElement("a", { href: props.href, className: props.className }, props.children),
}));
