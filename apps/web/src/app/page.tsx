import { LaundryApp } from "@/components/laundry-app";
import { LaundryProvider } from "@/lib/laundry";

export default function Home() {
  return (
    <LaundryProvider>
      <LaundryApp />
    </LaundryProvider>
  );
}
