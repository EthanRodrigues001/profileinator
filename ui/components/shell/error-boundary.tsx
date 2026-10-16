"use client";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Keeps a failing page from blanking the whole app: shows what broke and lets you retry or move on. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl p-10 text-center">
        <h2 className="font-medium">This page hit an error</h2>
        <p className="mt-2 break-words font-mono text-xs text-muted-foreground">{this.state.error.message}</p>
        <Button className="mt-5" variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
