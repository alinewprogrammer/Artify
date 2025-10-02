import { SignUp } from '@clerk/nextjs'

const SignUpPage = () => {
  return <SignUp afterSignUpUrl="/" redirectUrl="/" />

}

export default SignUpPage