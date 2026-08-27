import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Zombie Escape · Landrush Lab',
}

type ZombieEscapePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ZombieEscapePage({ searchParams }: ZombieEscapePageProps) {
  const redirectParams = new URLSearchParams()
  for (const [key, value] of Object.entries((await searchParams) ?? {})) {
    if (typeof value === 'string') redirectParams.set(key, value)
    else if (Array.isArray(value)) {
      for (const entry of value) redirectParams.append(key, entry)
    }
  }
  redirectParams.set('game', 'zombie-escape')
  redirect(`/landrush-lab/pascal-multiplayer-island?${redirectParams}`)
}
