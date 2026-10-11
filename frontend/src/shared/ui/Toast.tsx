import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  duration?: number;
  onClose?: () => void;
}

/**
 * Toast - Temporary notification matching atlas-app.html design
 */
export function Toast({ message, duration = 1800, onClose }: ToastProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onClose) {
        setTimeout(onClose, 200); // Wait for fade out animation
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className={`toast ${isVisible ? 'on' : ''}`} role="status">
      {message}
    </div>
  );
}

// Toast container to manage multiple toasts
interface ToastContainerProps {
  toasts: Array<{ id: string; message: string }>;
  onRemoveToast: (id: string) => void;
}

export function ToastContainer({ toasts, onRemoveToast }: ToastContainerProps): JSX.Element {
  return (
    <>
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast.message} onClose={() => onRemoveToast(toast.id)} />
      ))}
    </>
  );
}
