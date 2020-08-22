import React, { useState, useEffect } from 'react'
import {
    BrowserRouter as Router,
    Switch,
    Route,
    Redirect,
} from "react-router-dom"

import { ROUTES } from '../../constants'
import { HomePage } from '../Home'
import { useFirebase } from '../Firebase'
import { useSession, SessionContext } from '../Session/'
import { CreateNewProfilePayload } from '../../Types/CreateNewProfile';
import { SessionObject } from '../Session/useSession';

interface CredentialObj {
    oauthAccessToken: string,
    oauthTokenSecret: string
}

const TwitterAuthPage: React.FC = () => {
    const firebase = useFirebase()

    const [invalidProfileCreation, setInvalidProfileCreation] = useState(false)
    const [profileComplete, setProfileComplete] = useState(false)
    const [pageMode, setPageMode] = useState(0)

    useEffect(() => {
        const checkTwitterRedirect = async () => {
            try {
                const redirectResult = await firebase.auth.getRedirectResult()
                const { user, credential } = redirectResult
                if (user) {
                    // User just finished sign in, coming from Twitter
                    setPageMode(2)
                    const credentialObj = credential?.toJSON() as CredentialObj
                    const payload: CreateNewProfilePayload = {
                        accessToken: credentialObj.oauthAccessToken,
                        accessTokenSecret: credentialObj.oauthTokenSecret
                    }
                    
                    // Check to create new profile
                    try {
                        const createNewProfile = firebase.functions.httpsCallable('createNewProfile')
                        const createProfileResult = await createNewProfile(payload)
                        if (createProfileResult.data.success) {
                            setProfileComplete(true)
                        } else {
                            setInvalidProfileCreation(true)
                        }
                    } catch (error) {
                        setInvalidProfileCreation(true)
                    }
                } else {
                    // User just arrived on page
                    setPageMode(1)
                    firebase.doTwitterSignIn()
                }
            }
            catch (error) {
                console.log(error)
            }
        }

        checkTwitterRedirect()
    }, [firebase])

    if (pageMode === 0) {
        // Determining login stage 
        return (<div />)
    } else if (pageMode === 1) {
        // Before logging in
        return (
            <p>Redirecting you to Twitter for login...</p>
        )
    } else if (pageMode === 2) {
        // After logging in to Twitter and redirect 

        if (invalidProfileCreation) {
            return (
                <p>Failed to create profile</p>
            )
        } else if (profileComplete) {
            return (
                <Redirect to={ROUTES.ROOT} />
            )
        }
        return (
            <p>Creating your profile...</p>
        )
    } else {
        return <div />
    }

}

const AppWithRoutes: React.FC = () => {
    const session = useSession()

    if (session.initializing) {
        return (<div />)
    }

    return (
        <Router>
            <Switch>
                <Route path={ROUTES.TWITTER}>
                    <TwitterAuthPage />
                </Route>
                <Route path={ROUTES.ROOT}>
                    <HomePage />
                </Route>
            </Switch>
        </Router>
    )
}


const AppWithAuth: React.FC = () => {
    const firebase = useFirebase()
    const [session, setSession] = useState<SessionObject>({
        initializing: true,
        auth: null,
        prof: null,
    } as SessionObject)

    useEffect(() => {
        // Retrieve the logged in user's profile
        let unsubscribeProfile = () => { }

        function onChange(newUser: any) {
            console.log('New user detected in auth onChange: ', newUser)
            if (newUser === null) {
                // Not authenticated
                setSession({ initializing: false, auth: null, prof: null })
            } else {
                // TODO: replace `users` with wherever your user's profiles are located
                unsubscribeProfile = firebase.db.collection('users').doc(newUser.uid).onSnapshot(async function (profileDoc) {
                    console.log('Retrieving profile')
                    const profileData = profileDoc.data()
                    setSession({ initializing: false, auth: newUser, prof: profileData })
                }, (error) => {
                    console.error('Couldn\'t access profile')
                    console.log(error)
                    setSession({ initializing: false, auth: newUser, prof: null })
                })

            }
        }

        // listen for auth state changes
        const unsubscribe = firebase.auth.onAuthStateChanged(onChange)

        return () => {
            unsubscribeProfile()
            unsubscribe()
        }
    }, [firebase])

    return (
        <SessionContext.Provider value={session}>
            <AppWithRoutes />
        </SessionContext.Provider>
    )
}





export { AppWithAuth } 