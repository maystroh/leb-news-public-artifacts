import {Composition} from 'remotion';
import briefing from './data/briefing.json';
import {BriefingVideo, calculateDurationInFrames} from './BriefingVideo';
import {MapFocusVideo} from './MapFocusVideo';
import {
  ProductionBriefingVideo,
  ProductionIntroOnly,
  calculateProductionDurationInFrames,
  calculateProductionIntroDurationInFrames
} from './ProductionBriefingVideo';

export const Root = () => {
  return (
    <>
      <Composition
        id="BriefingDaily"
        component={BriefingVideo}
        durationInFrames={calculateDurationInFrames(briefing)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{briefing}}
      />
      <Composition
        id="MapFocusBeirut"
        component={MapFocusVideo}
        durationInFrames={150}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="ProductionBriefing"
        component={ProductionBriefingVideo}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{briefing, assets: {}}}
        calculateMetadata={({props}) => ({
          durationInFrames: calculateProductionDurationInFrames(props.briefing ?? briefing, 30)
        })}
      />
      <Composition
        id="ProductionIntroOnly"
        component={ProductionIntroOnly}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{briefing, assets: {}}}
        calculateMetadata={({props}) => ({
          durationInFrames: calculateProductionIntroDurationInFrames(props.briefing ?? briefing, 30)
        })}
      />
    </>
  );
};
