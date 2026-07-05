import { Component, type ReactNode } from "react";

// 1枚の壊れたカード（不正 content で描画中に throw）が一覧全体を白画面に巻き込まない為の境界（監査：横断/堅牢性）。
// 子の描画が投げたら fallback に差し替える。境界を細かく（カード単位で）巻くほど巻き添えが小さい。
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
