import {
  Bell,
  Inbox,
  MessageSquare,
  Paperclip,
  Siren,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/**
 * Demandas de clientes são sempre prioridade — destaque em todas as
 * superfícies de notificação (sino, lista e popup).
 */
export function isPriorityNotification(type: string): boolean {
  return type.startsWith("demand.");
}

const ICONS: Record<string, LucideIcon> = {
  comment: MessageSquare,
  "demand.created": Inbox,
  "demand.status": Inbox,
  "registration.created": UserPlus,
  upload: Paperclip,
};

/** Ícone da notificação — prioridade sempre com sirene. */
export function notificationIcon(type: string): LucideIcon {
  if (isPriorityNotification(type)) return Siren;
  return ICONS[type] ?? Bell;
}
