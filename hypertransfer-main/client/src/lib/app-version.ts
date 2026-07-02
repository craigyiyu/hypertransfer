const appVersion = import.meta.env.VITE_APP_VERSION || "0.0.0";
const gitCommit = import.meta.env.VITE_GIT_COMMIT || "local";

export const appBuildLabel = `v${appVersion}+${gitCommit}`;
