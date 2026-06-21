import React from 'react'
import { Composition } from 'remotion'
import { Intro } from './Intro.jsx'
import { Explainer } from './Explainer.jsx'

export const RemotionRoot = () => {
  return (
    <>
      <Composition id="ContinuityExplainer" component={Explainer} durationInFrames={350} fps={30} width={1920} height={1080} />
      <Composition id="ContinuityIntro" component={Intro} durationInFrames={210} fps={30} width={1920} height={1080} />
    </>
  )
}
