import { useState } from 'react'
import { umpire, enabledWhen, check } from '@umpire/core'
// useUmpire from @umpire/devtools/react powers the optional panel on this page.
// Swap back to: import { useUmpire } from '@umpire/react'  (remove leading ump arg)
import { useUmpire } from '@umpire/devtools/react'

// --- Umpire setup ---

const loginFields = {
  email:    { required: true, isEmpty: (v: unknown) => !v },
  password: { required: true, isEmpty: (v: unknown) => !v },
  submit:   { required: true },
}

type LoginConditions = {
  captchaToken: string | null
}

const allReasons = [
  'Complete the captcha to continue',
  'Enter a valid email address',
  'Enter a password',
] as const

const loginUmp = umpire<typeof loginFields, LoginConditions>({
  fields: loginFields,
  rules: [
    enabledWhen('submit', (_v, cond) => !!cond.captchaToken, {
      reason: allReasons[0],
    }),
    enabledWhen('submit', check('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/), {
      reason: allReasons[1],
    }),
    enabledWhen('submit', ({ password }) => !!password, {
      reason: allReasons[2],
    }),
  ],
})

// --- Helpers ---

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

// --- Component ---

export default function CaptchaDemo() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaSolved, setCaptchaSolved] = useState(false)

  const values = { email, password, submit: undefined }
  const conditions: LoginConditions = { captchaToken: captchaSolved ? 'cf-turnstile-demo' : null }
  const { check: availability } = useUmpire(loginUmp, values, conditions)

  const submitAv = availability.submit
  const isEnabled = submitAv.enabled
  const primaryReason = submitAv.reason
  const failingReasons = submitAv.reasons ?? []

  return (
    <div className="c-captcha-demo">
      <div className="c-captcha-demo__panel">
        <div className="c-captcha-demo__header">
          <span>Login</span>
          <span className="c-captcha-demo__header-accent">Captcha Gate</span>
        </div>
        <div className="c-captcha-demo__body">
          {/* Email */}
          <div className="c-captcha-demo__field">
            <label className="c-captcha-demo__label">Email</label>
            <input
              className="c-captcha-demo__input"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="c-captcha-demo__field">
            <label className="c-captcha-demo__label">Password</label>
            <input
              className="c-captcha-demo__input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Captcha toggle */}
          <div
            className={cls(
              'c-captcha-demo__captcha',
              captchaSolved && 'c-captcha-demo__captcha is-solved',
            )}
            onClick={() => setCaptchaSolved((s) => !s)}
          >
            <div
              className={cls(
                'c-captcha-demo__checkbox',
                captchaSolved && 'c-captcha-demo__checkbox is-checked',
              )}
            >
              {captchaSolved && <span className="c-captcha-demo__checkbox-mark">✓</span>}
            </div>
            <span className="c-captcha-demo__captcha-label">
              🤖 I'm not a robot
            </span>
          </div>

          {/* Submit */}
          <button
            className={cls(
              'c-captcha-demo__submit',
              isEnabled ? 'c-captcha-demo__submit is-enabled' : 'c-captcha-demo__submit is-disabled',
            )}
            disabled={!isEnabled}
            onClick={() => {
              if (isEnabled) alert('Sign-in submitted!')
            }}
          >
            Sign In
          </button>

          {/* Reasons */}
          <div className="c-captcha-demo__reasons">
            <div className="c-captcha-demo__reasons-title">
              reason{!isEnabled && primaryReason ? ` → ${primaryReason}` : ''}
            </div>
            {allReasons.map((reason) => {
              const isFailing = failingReasons.includes(reason)
              const isPrimary = reason === primaryReason

              return (
                <div
                  key={reason}
                  className={cls(
                    'c-captcha-demo__reason',
                    isFailing ? 'c-captcha-demo__reason is-failing' : 'c-captcha-demo__reason is-passing',
                    isFailing && isPrimary && 'c-captcha-demo__reason--primary',
                  )}
                >
                  <span
                    className={cls(
                      'c-captcha-demo__reason-dot',
                      isFailing ? 'c-captcha-demo__reason-dot is-failing' : 'c-captcha-demo__reason-dot is-passing',
                    )}
                  />
                  {reason}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
