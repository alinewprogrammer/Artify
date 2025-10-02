import { SignIn } from '@clerk/nextjs'

const SignInPage = () => {
  return <SignIn afterSignInUrl="/" redirectUrl="/" />

}

export default SignInPage