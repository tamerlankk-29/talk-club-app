import { toast } from 'sonner';
import { errorMessage } from '@/lib/api/client';

export { toast };

export function toastError(error: unknown): void {
  toast.error(errorMessage(error));
}
