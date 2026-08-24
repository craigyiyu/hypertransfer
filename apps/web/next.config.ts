import type { NextConfig } from "next"

// 后端地址:开发/本地默认 FastAPI(localhost:8000);生产由 nginx /api 反代处理(静态导出无服务端)
const backendTarget = process.env.API_PROXY_TARGET || "http://localhost:8000"

const nextConfig: NextConfig = {
  // 全站路由均为静态页 → 静态导出, 生产由 nginx 直接托管 out/(无需 Node 运行时)
  output: "export",
  trailingSlash: false,
  transpilePackages: ["@workspace/ui"],
  async rewrites() {
    // 仅开发模式(next dev)生效: 把 /api 反代到本地 FastAPI
    return [
      {
        source: "/api/:path*",
        destination: `${backendTarget}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
