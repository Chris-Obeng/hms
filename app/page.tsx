"use client"

import { Show, useAuth } from "@clerk/nextjs"

export default function Home() {

  const { userId, orgId } = useAuth()
  return (<>
  <div>
    <div className="w-full h-full">
      <div className="flex flex-col items-center text-2xl justify-center">
        <div className="text-2xl font-bold">This is the landing page</div>
        <div className="text-2xl font-bold">
          {userId ? <div>User ID: {userId}</div> : <div>No user ID</div>}
          {orgId ? <div>Org ID: {orgId}</div> : <div>No org ID</div>}
        </div>
      </div>
    </div>
  </div>
  </>)
}
