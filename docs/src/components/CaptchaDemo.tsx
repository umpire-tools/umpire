import { useState } from 'react'
import { umpire, enabledWhen, check } from '@umpire/core'

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
  const availability = loginUmp.check(values, conditions)

  const submitAv = availability.submit
  const isEnabled = submitAv.enabled
  const primaryReason = submitAv.reason
  const failingReasons = submitAv.reasons ?? []

  return (
    <div className="captcha-demo">
      <div className="captcha-demo__panel">
        <div className="captcha-demo__header">
          <span>Login</span>
          <span className="captcha-demo__header-accent">Captcha Gate</span>
        </div>
        <div className="captcha-demo__body">
          {/* Email */}
          <div className="captcha-demo__field">
            <label className="captcha-demo__label">Email</label>
            <input
              className="captcha-demo__input"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="captcha-demo__field">
            <label className="captcha-demo__label">Password</label>
            <input
              className="captcha-demo__input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Captcha toggle */}
          <div
            className={cls(
              'captcha-demo__captcha',
              captchaSolved && 'captcha-demo__captcha--solved',
            )}
            onClick={() => setCaptchaSolved((s) => !s)}
          >
            <div
              className={cls(
                'captcha-demo__checkbox',
                captchaSolved && 'captcha-demo__checkbox--checked',
              )}
            >
              {captchaSolved && <span className="captcha-demo__checkbox-mark">✓</span>}
            </div>
            <span className="captcha-demo__captcha-label">
              🤖 I'm not a robot
            </span>
          </div>

          {/* Submit */}
          <button
            className={cls(
              'captcha-demo__submit',
              isEnabled ? 'captcha-demo__submit--enabled' : 'captcha-demo__submit--disabled',
            )}
            disabled={!isEnabled}
            onClick={() => {
              if (isEnabled) alert('Sign-in submitted!')
            }}
          >
            Sign In
          </button>

          {/* Reasons */}
          <div className="captcha-demo__reasons">
            <div className="captcha-demo__reasons-title">
              reason{!isEnabled && primaryReason ? ` → ${primaryReason}` : ''}
            </div>
            {allReasons.map((reason) => {
              const isFailing = failingReasons.includes(reason)
              const isPrimary = reason === primaryReason

              return (
                <div
                  key={reason}
                  className={cls(
                    'captcha-demo__reason',
                    isFailing ? 'captcha-demo__reason--failing' : 'captcha-demo__reason--passing',
                    isFailing && isPrimary && 'captcha-demo__reason--primary',
                  )}
                >
                  <span
                    className={cls(
                      'captcha-demo__reason-dot',
                      isFailing ? 'captcha-demo__reason-dot--failing' : 'captcha-demo__reason-dot--passing',
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
