export const appConfig = {
  appName: "mesh-mafia",
  storagePrefix: "mesh-mafia",
  description:
    "Peer-to-peer Werewolf. Phones are role cards, dealt by cryptographic commit-reveal so no phone (and no server) ever knows the wolf.",
  accentHex: "#c45e5e",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  repositoryUrl: "https://github.com/baditaflorin/mesh-mafia",
  pagesUrl: "https://baditaflorin.github.io/mesh-mafia/",
  signalingUrl:
    (import.meta.env.VITE_WEBRTC_SIGNALING as string | undefined) ?? "wss://turn.0docker.com/ws",
  turnTokenUrl:
    (import.meta.env.VITE_TURN_TOKEN_URL as string | undefined) ??
    "https://turn.0docker.com/credentials",
  paypalUrl: "https://www.paypal.com/paypalme/florinbadita",
} as const;
