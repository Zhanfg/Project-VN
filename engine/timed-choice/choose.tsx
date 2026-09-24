import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { changeScene } from '@/Core/controller/scene/changeScene';
import { jmp } from '@/Core/gameScripts/label/jmp';
import ReactDOM from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import styles from './choose.module.scss';
import { RootState, webgalStore } from '@/store/store';
import { useSEByWebgalStore } from '@/hooks/useSoundEffect';
import { WebGAL } from '@/Core/WebGAL';
import { whenChecker } from '@/Core/controller/gamePlay/scriptExecutor';
import useEscape from '@/hooks/useEscape';
import useApplyStyle from '@/hooks/useApplyStyle';
import { Provider, useSelector } from 'react-redux';
import { useFontFamily } from '@/hooks/useFontFamily';
import { getNumberArgByKey } from '@/Core/util/getSentenceArg';

class ChooseOption {
  /**
   * 格式：
   * (showConditionVar>1)[enableConditionVar>2]->text:jump
   */
  public static parse(script: string): ChooseOption {
    const parts = script.split('->');
    const conditonPart = parts.length > 1 ? parts[0] : null;
    const mainPart = parts.length > 1 ? parts[1] : parts[0];
    const mainPartNodes = mainPart.split(/(?<!\\):/g);
    const option = new ChooseOption(mainPartNodes[0], mainPartNodes[1]);
    if (conditonPart !== null) {
      const showConditionPart = conditonPart.match(/\((.*)\)/);
      if (showConditionPart) {
        option.showCondition = showConditionPart[1];
      }
      const enableConditionPart = conditonPart.match(/\[(.*)\]/);
      if (enableConditionPart) {
        option.enableCondition = enableConditionPart[1];
      }
    }
    return option;
  }

  public text: string;
  public jump: string;
  public jumpToScene: boolean;
  public showCondition?: string;
  public enableCondition?: string;

  public constructor(text: string, jump: string) {
    this.text = useEscape(text);
    this.jump = jump;
    this.jumpToScene = jump.match(/(?<!\\)\./) !== null;
  }
}

/**
 * 显示选择枝。
 *
 * 《放学后》扩展参数：
 * -timeout=<seconds>       选择倒计时，单位秒。
 * -timeoutChoose=<index>   超时后自动选择的 1-based 原始选项索引。
 *
 * 普通 choose 不带这两个参数时保持 WebGAL 原行为。
 */
export const choose = (sentence: ISentence): IPerform => {
  const chooseOptionScripts = sentence.content.split(/(?<!\\)\|/);
  const chooseOptions = chooseOptionScripts.map((e) => ChooseOption.parse(e.trim()));
  const timeoutSeconds = getPositiveNumberArg(sentence, 'timeout');
  const timeoutChoose = getPositiveIntegerArg(sentence, 'timeoutChoose');

  // 实时预览不能一直卡在 timed choice 上；若没有显式 defaultChoose，
  // 使用超时默认项作为预览路径。普通游戏运行仍然等待玩家或倒计时。
  const defaultChoose = getNumberArgByKey(sentence, 'defaultChoose') ?? timeoutChoose;
  const defaultPreviewChoice = getDefaultPreviewChoice(chooseOptions, defaultChoose);

  if (defaultPreviewChoice) {
    selectChooseOption(defaultPreviewChoice, false);
    if (!defaultPreviewChoice.jumpToScene) {
      sentence.args.push({ key: 'next', value: true });
    }
    return createNonePerform({ blockingAuto: false });
  }

  return {
    performName: 'choose',
    duration: 1000 * 60 * 60 * 24,
    isHoldOn: false,
    startFunction: () => {
      // eslint-disable-next-line react/no-deprecated
      ReactDOM.render(
        <Provider store={webgalStore}>
          <Choose
            chooseOptions={chooseOptions}
            timeoutSeconds={timeoutSeconds}
            timeoutChoose={timeoutChoose}
          />
        </Provider>,
        document.getElementById('chooseContainer'),
      );
    },
    stopFunction: () => {
      // eslint-disable-next-line react/no-deprecated
      ReactDOM.render(<div />, document.getElementById('chooseContainer'));
    },
    blockingNext: () => true,
    blockingAuto: () => true,
    blockingStateCalculation: () => true,
  };
};

function getPositiveNumberArg(sentence: ISentence, key: string): number | null {
  const value = getNumberArgByKey(sentence, key);
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function getPositiveIntegerArg(sentence: ISentence, key: string): number | null {
  const value = getNumberArgByKey(sentence, key);
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function getDefaultPreviewChoice(chooseOptions: ChooseOption[], defaultChoose: number | null): ChooseOption | null {
  if (!WebGAL.gameplay.isFastPreview || defaultChoose === null) {
    return null;
  }
  return getSelectableChoice(chooseOptions, defaultChoose);
}

function getSelectableChoice(chooseOptions: ChooseOption[], choiceIndexOneBased: number | null): ChooseOption | null {
  if (choiceIndexOneBased === null) {
    return null;
  }
  const chooseIndex = Math.floor(choiceIndexOneBased) - 1;
  if (chooseIndex < 0) {
    return null;
  }
  const option = chooseOptions[chooseIndex];
  if (!option || !whenChecker(option.showCondition) || !whenChecker(option.enableCondition)) {
    return null;
  }
  return option;
}

function selectChooseOption(option: ChooseOption, autoNext = true) {
  if (option.jumpToScene) {
    changeScene(option.jump, option.text);
  } else {
    jmp(option.jump, autoNext);
  }
}

interface ChooseProps {
  chooseOptions: ChooseOption[];
  timeoutSeconds: number | null;
  timeoutChoose: number | null;
}

function Choose(props: ChooseProps) {
  const font = useFontFamily();
  const { playSeEnter, playSeClick } = useSEByWebgalStore();
  const applyStyle = useApplyStyle('choose');
  const GUIState = useSelector((state: RootState) => state.GUI);

  const totalMs = props.timeoutSeconds === null ? 0 : props.timeoutSeconds * 1000;
  const timeoutOption = getSelectableChoice(props.chooseOptions, props.timeoutChoose);
  const timerEnabled = totalMs > 0 && timeoutOption !== null;

  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [pageHidden, setPageHidden] = useState(document.hidden);
  const remainingRef = useRef(totalMs);
  const lastTickRef = useRef(performance.now());
  const resolvedRef = useRef(false);

  const paused =
    pageHidden ||
    GUIState.showMenuPanel ||
    GUIState.showBacklog ||
    GUIState.showFlowchart ||
    GUIState.showGlobalDialog ||
    GUIState.showPanicOverlay;

  useEffect(() => {
    const onVisibilityChange = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    remainingRef.current = totalMs;
    setRemainingMs(totalMs);
    lastTickRef.current = performance.now();
    resolvedRef.current = false;
  }, [totalMs, props.timeoutChoose]);

  useEffect(() => {
    if (!timerEnabled || resolvedRef.current) {
      return;
    }

    // 暂停期间只重置时间采样点，不扣除菜单/后台停留时间。
    if (paused) {
      lastTickRef.current = performance.now();
      return;
    }

    lastTickRef.current = performance.now();
    const timer = window.setInterval(() => {
      if (resolvedRef.current) {
        return;
      }

      const now = performance.now();
      const elapsed = Math.max(0, now - lastTickRef.current);
      lastTickRef.current = now;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      setRemainingMs(remainingRef.current);

      if (remainingRef.current <= 0 && timeoutOption) {
        resolvedRef.current = true;
        window.clearInterval(timer);
        WebGAL.gameplay.performController.unmountPerform('choose');
        selectChooseOption(timeoutOption);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [paused, timerEnabled, timeoutOption]);

  const resolveManualChoice = (option: ChooseOption) => {
    if (resolvedRef.current) {
      return;
    }
    resolvedRef.current = true;
    playSeClick();
    WebGAL.gameplay.performController.unmountPerform('choose');
    selectChooseOption(option);
  };

  const runtimeBuildList = (chooseListFull: ChooseOption[]) => {
    return chooseListFull
      .filter((e) => whenChecker(e.showCondition))
      .map((e, i) => {
        const enable = whenChecker(e.enableCondition);
        const className = enable
          ? applyStyle('Choose_item', styles.Choose_item)
          : applyStyle('Choose_item_disabled', styles.Choose_item_disabled);
        const onClick = enable ? () => resolveManualChoice(e) : () => {};

        return (
          <div className={applyStyle('Choose_item_outer', styles.Choose_item_outer)} key={e.jump + i}>
            <div className={className} style={{ fontFamily: font }} onClick={onClick} onMouseEnter={playSeEnter}>
              {e.text}
            </div>
          </div>
        );
      });
  };

  const ratio = timerEnabled && totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;

  return (
    <div className={applyStyle('Choose_Main', styles.Choose_Main)}>
      {timerEnabled && (
        <div
          className={applyStyle('Choose_timer', styles.Choose_timer)}
          aria-label="Timed choice countdown"
          aria-live="polite"
        >
          <div className={applyStyle('Choose_timer_header', styles.Choose_timer_header)}>
            <span>TIME LIMIT</span>
            <span>{(remainingMs / 1000).toFixed(1)} s</span>
          </div>
          <div className={applyStyle('Choose_timer_track', styles.Choose_timer_track)}>
            <div
              className={applyStyle('Choose_timer_fill', styles.Choose_timer_fill)}
              style={{ width: Math.round(ratio * 1000) / 10 + '%' }}
            />
          </div>
        </div>
      )}
      {runtimeBuildList(props.chooseOptions)}
    </div>
  );
}
