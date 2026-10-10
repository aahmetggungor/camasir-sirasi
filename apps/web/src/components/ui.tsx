"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CircleCheck, Info, LoaderCircle, X } from "lucide-react";
import { useLaundry } from "@/lib/laundry";

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function Spinner({ text = "Yükleniyor…" }: { text?: string }) {
  return (
    <div className="loading-state">
      <LoaderCircle className="spin" size={24} />
      <span>{text}</span>
    </div>
  );
}

export function Notice() {
  const { notice, setNotice } = useLaundry();
  if (!notice) return null;
  return (
    <div
      className={`notice notice-${notice.kind}`}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      {notice.kind === "success" ? (
        <CircleCheck size={18} />
      ) : (
        <Info size={18} />
      )}
      <span>{notice.text}</span>
      <button aria-label="Bildirimi kapat" onClick={() => setNotice(null)}>
        <X size={17} />
      </button>
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="Pencereyi kapat"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    available: "Müsait",
    running: "Kullanım sürüyor",
    awaiting_pickup: "Çamaşırlar alınacak",
    out_of_order: "Servis dışı",
    needs_check: "Kontrol gerekiyor",
    confirmed: "Rezerve",
    offered: "Teklif gönderildi",
    completed: "Tamamlandı",
    cancelled: "İptal",
    no_show: "Gelinmedi",
    pending: "Onay bekliyor",
    active: "Aktif",
    rejected: "Reddedildi",
    removed: "Çıkarıldı",
    blocked: "Engellendi",
    waiting: "Sırada",
    accepted: "Kabul edildi",
    expired: "Süresi doldu",
    declined: "Reddedildi",
  };
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" />
      {labels[status] ?? status}
    </span>
  );
}

export function dateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(value));
}
export function time(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(new Date(value));
}
export function localDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
