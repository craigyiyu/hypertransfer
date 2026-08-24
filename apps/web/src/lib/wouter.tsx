/**
 * wouter → Next.js App Router 兼容 shim。
 *
 * 迁移自 Vite+wouter 的 HyperTransfer 客户端时，所有 `from "wouter"` 导入都指向本模块，
 * 页面组件无需改动即可工作：
 *   - useLocation() -> [pathname, navigate]   (navigate 走 Next router)
 *   - navigate(to, opts?)                     (模块级函数, 通过 RouterBridge 桥接)
 *   - <Link href>                             (包装 next/link)
 *   - <Redirect to>                           (挂载后 router.replace)
 *   - useRoute(path) / useSearch() / <Route> / <Switch>  兼容性实现(当前客户端未用)
 */
"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import NextLink from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

type NavigateOptions = { replace?: boolean };

// 模块级 router 桥接:RouterBridge 挂载后注入 push/replace。
let pushFn: ((to: string, opts?: NavigateOptions) => void) | null = null;
let replaceFn: ((to: string) => void) | null = null;

/** 挂载在根布局里,把 Next router 桥接给模块级 navigate()。 */
export function RouterBridge() {
  const router = useRouter();
  useEffect(() => {
    pushFn = (to, opts) => {
      if (opts?.replace) router.replace(to);
      else router.push(to);
    };
    replaceFn = (to) => router.replace(to);
    return () => {
      pushFn = null;
      replaceFn = null;
    };
  }, [router]);
  return null;
}

export function navigate(to: string, opts?: NavigateOptions) {
  if (pushFn) {
    pushFn(to, opts);
  } else if (typeof window !== "undefined") {
    // 兜底(理论不触发):直接整页跳转
    window.location.assign(to);
  }
}

/** wouter 风格 useLocation():[location, navigate] */
export function useLocation(): [string, typeof navigate] {
  const pathname = usePathname();
  return [pathname ?? "/", navigate];
}

function matchPath(pattern: string, pathname: string): { match: boolean; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const pParts = pathname.split("?").shift()?.split("/").filter(Boolean) ?? [];
  const ppParts = pattern.split("/").filter(Boolean);
  if (ppParts.length !== pParts.length) return { match: false, params };
  for (let i = 0; i < ppParts.length; i++) {
    const seg = ppParts[i] ?? "";
    const actual = pParts[i] ?? "";
    if (seg.startsWith(":")) {
      params[seg.slice(1)] = decodeURIComponent(actual);
    } else if (seg === "*") {
      params["*"] = decodeURIComponent(pParts.slice(i).join("/"));
      return { match: true, params };
    } else if (seg !== actual) {
      return { match: false, params };
    }
  }
  return { match: true, params };
}

/** wouter 风格 useRoute(path):[matched, params] */
export function useRoute(pattern: string): [boolean, Record<string, string>] {
  const [location] = useLocation();
  return [matchPath(pattern, location).match, matchPath(pattern, location).params];
}

/** wouter 风格 useSearch():URLSearchParams */
export function useSearch(): URLSearchParams {
  return useNextSearchParams();
}

type WouterLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
};

/** wouter <Link> 兼容:包装 next/link。 */
export const Link = forwardRef<HTMLAnchorElement, WouterLinkProps>(function Link(
  { href, children, ...rest },
  ref
) {
  return (
    <NextLink href={href} ref={ref} {...rest}>
      {children}
    </NextLink>
  );
});

/** wouter <Redirect> 兼容:挂载后 router.replace。 */
export function Redirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return null;
}

/** <Route>/<Switch> 兼容占位:App Router 下不再使用(路由由 app/ 目录定义)。 */
export function Route(): null {
  return null;
}

export function Switch({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
