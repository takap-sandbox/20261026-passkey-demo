/** @jsxImportSource hono/jsx/dom */
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { render, useState } from 'hono/jsx/dom'

type VerificationResult = { verified: boolean }

const request = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  return response.json()
}

export const PasskeyForm = () => {
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')

  const register = async () => {
    const query = encodeURIComponent(username)
    const optionsJSON = await request<PublicKeyCredentialCreationOptionsJSON>(
      `/api/register/options?username=${query}`,
    )

    const credential = await startRegistration({ optionsJSON })
    const result = await request<VerificationResult>(
      `/api/register/verify?username=${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential),
      },
    )
    if (result.verified) {
      setMessage('パスキー登録完了')
    }
  }

  const authenticate = async () => {
    const query = encodeURIComponent(username)
    const optionsJSON = await request<PublicKeyCredentialRequestOptionsJSON>(
      `/api/authenticate/options?username=${query}`,
    )
    const credential = await startAuthentication({ optionsJSON })
    const result = await request<VerificationResult>(
      `/api/authenticate/verify?username=${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential),
      },
    )
    if (result.verified) {
      window.location.assign('/')
    }
  }

  return (
    <>
      <h1>Passkey Demo</h1>
      <div>
        <label for="username">ユーザー名</label>
        <input
          name="username"
          autocomplete="username"
          value={username}
          onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
        />
      </div>
      <div>
        <button type="button" onClick={register}>
          パスキーを登録
        </button>
        <button
          type="button"
          onClick={authenticate}
        >
          パスキーで認証
        </button>
      </div>
      <p>{message}</p>
    </>
  )
}

const root = document.getElementById('app')
if (!root) {
  throw new Error('App mount point not found')
}
render(<PasskeyForm />, root)
