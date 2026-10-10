"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Etiketi indirip makinenin yanına yerleştir. QR yalnız kullanım kaydını doğrular. */
export function QrLabel({ value, name }: { value: string; name: string }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, {
      width: 320,
      margin: 3,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (active) setImage(url);
      })
      .catch(() => {
        if (active)
          setError("QR etiketi oluşturulamadı. Makine kodunu kullanabilirsin.");
      });
    return () => {
      active = false;
    };
  }, [value]);
  return (
    <>
      {image && (
        <>
          <img
            src={image}
            alt={`${name} kullanım QR etiketi`}
            width={240}
            height={240}
          />
          <a
            className="button button-secondary"
            href={image}
            download={`${name.replace(/[^a-zA-Z0-9]/g, "-")}-qr.png`}
          >
            QR etiketini indir
          </a>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
