import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ITechnicalViewState } from '@/Core/Modules/stage/stageInterface';
import { getNumberArgByKey, getStringArgByKey } from '@/Core/util/getSentenceArg';

const kinds = new Set<ITechnicalViewState['kind']>(['code', 'terminal', 'algorithm', 'plot', 'diagram']);
const placements = new Set<ITechnicalViewState['placement']>(['left', 'right', 'center', 'full']);

function initialTechnicalView(): ITechnicalViewState {
  return {
    visible: false,
    kind: 'code',
    src: '',
    title: '',
    placement: 'right',
    step: 0,
  };
}

export const tech = (sentence: ISentence): IPerform => {
  const state = stageStateManager.getCalculationStageState();
  const current: ITechnicalViewState = {
    ...initialTechnicalView(),
    ...(state.technicalView ?? {}),
  };
  const action = sentence.content.trim().toLowerCase();

  if (action === 'hide') {
    stageStateManager.setStage('technicalView', { ...current, visible: false });
    return createNonePerform();
  }

  if (action === 'clear') {
    stageStateManager.setStage('technicalView', initialTechnicalView());
    return createNonePerform();
  }

  if (action === 'step') {
    const step = getNumberArgByKey(sentence, 'step');
    stageStateManager.setStage('technicalView', {
      ...current,
      step: step === null ? current.step : Math.max(0, Math.trunc(step)),
    });
    return createNonePerform();
  }

  if (action === 'show') {
    const kindArg = getStringArgByKey(sentence, 'kind') as ITechnicalViewState['kind'] | null;
    const placementArg = getStringArgByKey(sentence, 'placement') as ITechnicalViewState['placement'] | null;
    const src = getStringArgByKey(sentence, 'src') ?? current.src;
    const title = getStringArgByKey(sentence, 'title') ?? current.title;
    const step = getNumberArgByKey(sentence, 'step');

    stageStateManager.setStage('technicalView', {
      visible: true,
      kind: kindArg && kinds.has(kindArg) ? kindArg : current.kind,
      src,
      title,
      placement: placementArg && placements.has(placementArg) ? placementArg : current.placement,
      step: step === null ? 0 : Math.max(0, Math.trunc(step)),
    });
    return createNonePerform();
  }

  return createNonePerform();
};
