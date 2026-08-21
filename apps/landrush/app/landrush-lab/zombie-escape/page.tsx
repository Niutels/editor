import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Zombie Escape · Landrush Lab',
}

export default function ZombieEscapePage() {
  redirect('/landrush-lab/pascal-multiplayer-island?game=zombie-escape')
}
