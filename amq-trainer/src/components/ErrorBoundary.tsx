import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Affiché à la place des enfants après une erreur ; `reset` réaffiche les enfants. */
  fallback: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/** Remplace un sous-arbre qui a planté par un message, au lieu d'un écran vide. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur interceptée :', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    return error ? this.props.fallback(error, () => this.setState({ error: null })) : this.props.children;
  }
}
