"use client";

import { useState, useEffect, FormEvent } from "react";
import { useOrganizationList, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createHotelProfile, type OnboardingInput } from "@/app/actions/onboarding";

const STORAGE_KEY = "hotelos_onboarding_data";

export default function OnboardingPage() {
  const { isLoaded, setActive, createOrganization, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  const { userId, orgId } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<OnboardingInput>>({
    country: "Ghana",
    number_of_rooms: 10,
    star_rating: "Unrated",
    hotel_type: "Hotel"
  });

  // Pre-fill email
  useEffect(() => {
    if (user?.primaryEmailAddress?.emailAddress && !formData.email) {
      setFormData(prev => ({ ...prev, email: user.primaryEmailAddress!.emailAddress }));
    }
  }, [user]);

  // Redirect if already onboarded
  useEffect(() => {
    if (isLoaded && orgId) {
      router.push("/dashboard");
    }
  }, [isLoaded, orgId, router]);

  // Auto-activate organization if user was invited and joined via webhook
  useEffect(() => {
    if (isLoaded && !orgId && userMemberships?.data && userMemberships.data.length > 0 && setActive) {
      const firstOrgId = userMemberships.data[0].organization.id;
      setActive({ organization: firstOrgId });
    }
  }, [isLoaded, orgId, userMemberships, setActive]);

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step) setStep(parsed.step);
        if (parsed.data) setFormData(prev => ({ ...prev, ...parsed.data }));
      } catch (e) {
        // ignore JSON parse error
      }
    }
  }, []);

  const saveToStorage = (newStep: number, newData: Partial<OnboardingInput>) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: newStep, data: newData }));
  };

  const handleNext = (e: FormEvent) => {
    e.preventDefault();
    const nextStep = step + 1;
    setStep(nextStep);
    saveToStorage(nextStep, formData);
  };

  const handleBack = () => {
    const prevStep = step - 1;
    setStep(prevStep);
    saveToStorage(prevStep, formData);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!createOrganization || !setActive) return;
    
    setLoading(true);
    setError(null);

    try {
      // 1. Create Clerk Organization
      const organization = await createOrganization({ name: formData.name! });
      
      // 2. Persist to Supabase
      const payload: OnboardingInput = {
        name: formData.name!,
        clerk_org_id: organization.id,
        address: formData.address!,
        city: formData.city!,
        country: formData.country || "Ghana",
        phone: formData.phone!,
        email: formData.email!,
        hotel_type: formData.hotel_type || "Hotel",
        number_of_rooms: Number(formData.number_of_rooms),
        star_rating: formData.star_rating,
        website: formData.website,
      };

      const result = await createHotelProfile(payload);
      
      if (result?.error) {
        throw new Error(result.error);
      }

      // 3. Set Active Org
      await setActive({ organization: organization.id });

      // Clean up storage
      localStorage.removeItem(STORAGE_KEY);
      
      // 4. Redirect
      router.push("/dashboard");
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Setup your Hotel Profile
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Step {step} of 3
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-200">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleNext} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Hotel Name</label>
                <input required type="text" value={formData.name || ""} onChange={e => setFormData({...formData, name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Hotel Type</label>
                <select required value={formData.hotel_type} onChange={e => setFormData({...formData, hotel_type: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border">
                  <option value="Hotel">Hotel</option>
                  <option value="Guesthouse">Guesthouse</option>
                  <option value="Motel">Motel</option>
                  <option value="Serviced Apartment">Serviced Apartment</option>
                  <option value="Lodge">Lodge</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Number of Rooms</label>
                <input required type="number" min="1" value={formData.number_of_rooms || ""} onChange={e => setFormData({...formData, number_of_rooms: Number(e.target.value)})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Star Rating (Optional)</label>
                <select value={formData.star_rating} onChange={e => setFormData({...formData, star_rating: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border">
                  <option value="Unrated">Unrated</option>
                  <option value="1">1 Star</option>
                  <option value="2">2 Stars</option>
                  <option value="3">3 Stars</option>
                  <option value="4">4 Stars</option>
                  <option value="5">5 Stars</option>
                </select>
              </div>
              <Button type="submit" className="w-full">Next</Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNext} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">Address / Location</label>
                <input required type="text" value={formData.address || ""} onChange={e => setFormData({...formData, address: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">City</label>
                <input required type="text" value={formData.city || ""} onChange={e => setFormData({...formData, city: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Country</label>
                <input required type="text" value={formData.country || ""} onChange={e => setFormData({...formData, country: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone Number</label>
                <input required type="tel" value={formData.phone || ""} onChange={e => setFormData({...formData, phone: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email Address</label>
                <input required type="email" value={formData.email || ""} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Website (Optional)</label>
                <input type="url" value={formData.website || ""} onChange={e => setFormData({...formData, website: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border" />
              </div>
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={handleBack} className="w-full">Back</Button>
                <Button type="submit" className="w-full">Next</Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-6 text-sm text-gray-700">
              <h3 className="font-semibold text-lg border-b pb-2 mb-4">Summary</h3>
              
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2"><span className="font-medium text-gray-500">Name:</span> <span className="col-span-2 font-semibold">{formData.name}</span></div>
                <div className="grid grid-cols-3 gap-2"><span className="font-medium text-gray-500">Type:</span> <span className="col-span-2">{formData.hotel_type} ({formData.number_of_rooms} rooms)</span></div>
                <div className="grid grid-cols-3 gap-2"><span className="font-medium text-gray-500">Location:</span> <span className="col-span-2">{formData.address}, {formData.city}, {formData.country}</span></div>
                <div className="grid grid-cols-3 gap-2"><span className="font-medium text-gray-500">Contact:</span> <span className="col-span-2">{formData.phone}<br/>{formData.email}</span></div>
              </div>

              <div className="flex gap-4 mt-8">
                <Button type="button" variant="outline" onClick={handleBack} className="w-full" disabled={loading}>Back</Button>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating Profile..." : "Create Hotel Profile"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}