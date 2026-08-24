// 构建时注入:由 Docker build args / CI 提供 NEXT_PUBLIC_APP_VERSION 与 NEXT_PUBLIC_GIT_COMMIT
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
const gitCommit = process.env.NEXT_PUBLIC_GIT_COMMIT || "local";

export const appBuildLabel = `v${appVersion}+${gitCommit}`;
