import { ISentence } from '@/Core/controller/scene/sceneInterface';
import { changeScene } from '@/Core/controller/scene/changeScene';
import { continueSentence } from '@/Core/controller/gamePlay/nextSentence';
import { jmp } from '@/Core/gameScripts/label/jmp';
import { whenChecker } from '@/Core/controller/gamePlay/scriptExecutor';
import { dumpToStorageFast } from '@/Core/controller/storage/storageController';
import { createNonePerform, IPerform } from '@/Core/Modules/perform/performInterface';
import { getStringArgByKey } from '@/Core/util/getSentenceArg';
import { setScriptManagedGlobalVar } from '@/store/userDataReducer';
import { RootState, webgalStore } from '@/store/store';
import { WebGAL } from '@/Core/WebGAL';
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { Provider, useSelector } from 'react-redux';
import styles from './vn.module.scss';
import { gamePath } from '@/Core/util/gameAssetsAccess/resourceBase';

interface VnTarget {
  scene?: string;
  label?: string;
}

interface VnUnlock {
  kind?: string;
  id?: string;
}

interface ChapterEntry {
  id: string;
  title?: string;
  subtitle?: string;
  description?: string;
  kind?: string;
  group?: string;
  order?: number;
  tags?: string[];
  routeId?: string;
  target?: VnTarget;
  lockedByDefault?: boolean;
  hiddenUntilUnlocked?: boolean;
  visibleWhen?: string;
  unlockWhen?: string;
  enabledWhen?: string;
  unlock?: VnUnlock;
  [key: string]: unknown;
}

interface VnRegistry {
  version?: number;
  chapters?: ChapterEntry[];
  [key: string]: unknown;
}

function safeToken(value: string): string {
  return encodeURIComponent(value.trim());
}

function progressKey(kind: string, id: string): string {
  return '__vn_mark::' + safeToken(kind) + '::' + safeToken(id);
}

function firstSeenKey(kind: string, id: string): string {
  return '__vn_first::' + safeToken(kind) + '::' + safeToken(id);
}

function ensureNext(sentence: ISentence) {
  if (!sentence.args.some((arg) => arg.key === 'next')) {
    sentence.args.push({ key: 'next', value: true });
  }
}

function markProgress(kind: string, id: string) {
  const normalizedKind = kind.trim();
  const normalizedId = id.trim();
  if (!normalizedKind || !normalizedId) return;

  const globals = webgalStore.getState().userData.globalGameVar;
  const key = progressKey(normalizedKind, normalizedId);
  const firstKey = firstSeenKey(normalizedKind, normalizedId);

  webgalStore.dispatch(setScriptManagedGlobalVar({ key, value: true }));
  if (globals[firstKey] === undefined) {
    webgalStore.dispatch(setScriptManagedGlobalVar({ key: firstKey, value: Date.now() }));
  }
  dumpToStorageFast();
}

function checkCondition(expression?: string): boolean {
  if (!expression) return true;
  try {
    return whenChecker(expression);
  } catch {
    return false;
  }
}

function isChapterUnlocked(chapter: ChapterEntry, globals: Record<string, unknown>): boolean {
  if (chapter.lockedByDefault !== true) return true;

  const unlockKind = chapter.unlock?.kind ?? 'chapter';
  const unlockId = chapter.unlock?.id ?? chapter.id;
  if (globals[progressKey(unlockKind, unlockId)] === true) return true;
  if (chapter.unlockWhen && checkCondition(chapter.unlockWhen)) return true;
  return false;
}

function stopSelector() {
  WebGAL.gameplay.performController.unmountPerform('vnChapterSelect');
}

function ChapterSelect({ group }: { group: string | null }) {
  const globals = useSelector((state: RootState) => state.userData.globalGameVar) as Record<string, unknown>;
  const [registry, setRegistry] = useState<VnRegistry | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(gamePath('vn/generated/registry.json'))
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((data: VnRegistry) => {
        if (!cancelled) setRegistry(data);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chapters = useMemo(() => {
    const source = registry?.chapters ?? [];
    return source
      .filter((chapter) => !group || chapter.group === group)
      .filter((chapter) => checkCondition(chapter.visibleWhen))
      .map((chapter) => ({
        chapter,
        unlocked: isChapterUnlocked(chapter, globals),
      }))
      .filter(({ chapter, unlocked }) => !chapter.hiddenUntilUnlocked || unlocked)
      .sort((a, b) => {
        const groupA = a.chapter.group ?? '';
        const groupB = b.chapter.group ?? '';
        if (groupA !== groupB) return groupA.localeCompare(groupB);
        return Number(a.chapter.order ?? 0) - Number(b.chapter.order ?? 0);
      });
  }, [registry, globals, group]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof chapters>();
    for (const item of chapters) {
      const key = item.chapter.group ?? '章节';
      const current = map.get(key) ?? [];
      current.push(item);
      map.set(key, current);
    }
    return [...map.entries()];
  }, [chapters]);

  const close = () => {
    stopSelector();
    continueSentence();
  };

  const openChapter = (chapter: ChapterEntry, unlocked: boolean) => {
    if (!unlocked || !checkCondition(chapter.enabledWhen)) return;
    const target = chapter.target;
    if (!target?.scene && !target?.label) return;

    markProgress('chapter', chapter.id);
    stopSelector();

    if (target.scene) {
      changeScene(target.scene, chapter.title ?? chapter.id);
    } else if (target.label) {
      jmp(target.label);
    }
  };

  return (
    <div className={styles.overlay}>
      <section className={styles.panel} aria-label="Chapter select">
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>CHAPTER SELECT</div>
            <h2>{group ?? '章节选择'}</h2>
          </div>
          <button className={styles.closeButton} onClick={close} aria-label="关闭章节选择">
            ×
          </button>
        </header>

        <div className={styles.content}>
          {error && <div className={styles.empty}>无法读取章节注册表：{error}</div>}
          {!error && !registry && <div className={styles.empty}>正在读取章节信息…</div>}
          {!error && registry && grouped.length === 0 && (
            <div className={styles.empty}>
              <strong>尚未登记章节。</strong>
              <span>当前可以先保留系统，等剧情结构确定后再逐项加入。</span>
            </div>
          )}

          {grouped.map(([groupName, items]) => (
            <div className={styles.group} key={groupName}>
              <h3>{groupName}</h3>
              <div className={styles.chapterGrid}>
                {items.map(({ chapter, unlocked }) => {
                  const hasTarget = Boolean(chapter.target?.scene || chapter.target?.label);
                  const enabled = unlocked && hasTarget && checkCondition(chapter.enabledWhen);
                  return (
                    <button
                      key={chapter.id}
                      className={enabled ? styles.chapterCard : styles.chapterCardDisabled}
                      onClick={() => openChapter(chapter, unlocked)}
                      disabled={!enabled}
                    >
                      <div className={styles.chapterMeta}>
                        <span>{chapter.kind ?? 'chapter'}</span>
                        {!unlocked && <span>LOCKED</span>}
                        {unlocked && !hasTarget && <span>PLANNED</span>}
                      </div>
                      <strong>{chapter.title ?? chapter.id}</strong>
                      {chapter.subtitle && <small>{chapter.subtitle}</small>}
                      {chapter.description && <p>{chapter.description}</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export const vn = (sentence: ISentence): IPerform => {
  const action = sentence.content.trim().toLowerCase();

  if (action === 'mark') {
    const kind = getStringArgByKey(sentence, 'kind') ?? 'custom';
    const id = getStringArgByKey(sentence, 'id') ?? '';
    markProgress(kind, id);
    ensureNext(sentence);
    return createNonePerform({ blockingAuto: false });
  }

  if (action === 'chapterselect') {
    const group = getStringArgByKey(sentence, 'group');
    return {
      performName: 'vnChapterSelect',
      duration: 1000 * 60 * 60 * 24,
      isHoldOn: false,
      startFunction: () => {
        // eslint-disable-next-line react/no-deprecated
        ReactDOM.render(
          <Provider store={webgalStore}>
            <ChapterSelect group={group} />
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
  }

  ensureNext(sentence);
  return createNonePerform({ blockingAuto: false });
};
