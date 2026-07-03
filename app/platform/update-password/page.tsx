import { UpdatePasswordForm } from "./_components/update-password-form";

export const metadata = { title: "Update Password — HotelOS Pro Platform" };

export default function UpdatePasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1C1917] p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-white/10 mb-4">
            <span className="text-2xl font-bold text-white">H</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Set new password</h1>
          <p className="text-sm text-white/40 mt-1">HotelOS Pro Platform Admin</p>
        </div>
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
