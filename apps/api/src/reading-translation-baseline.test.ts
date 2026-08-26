import { describe, expect, it } from "vitest";
import { assessTranslationQuality, normalizeTranslationInput } from "./reading-translation.js";

const BASELINE = [
  ["The rain stopped before breakfast.", "早餐前雨停了。"],
  ["She opened the window and listened.", "她打开窗户听了听。"],
  ["Mr. Holmes arrived at seven.", "福尔摩斯先生七点到了。"],
  ["The answer is not obvious.", "答案并不明显。"],
  ["Please write to reader@example.co.uk.", "请写信给 reader@example.co.uk。"],
  ["The value of pi is about 3.14.", "圆周率的值约为 3.14。"],
  ["They walked across the bridge.", "他们走过了桥。"],
  ["I will return before sunset.", "我会在日落前回来。"],
  ["The child remembered the story.", "孩子记得那个故事。"],
  ["Do not open the locked door.", "不要打开那扇锁着的门。"],
  ["Although it was late, they continued.", "虽然已经很晚了，他们仍然继续。"],
  ["The letter had been waiting for years.", "那封信已经等了很多年。"],
  ["If you are located in the United States, check the local laws.", "如果你位于美国，请查看当地法律。"],
  ["The company changed its policy after the meeting.", "会议结束后，公司修改了政策。"],
  ["He spoke softly so that no one would wake.", "他说话很轻，以免吵醒任何人。"],
  ["The road seemed longer than yesterday.", "这条路似乎比昨天更长。"],
  ["She wondered whether the train had already left.", "她想知道火车是否已经开走。"],
  ["The old house stood at the edge of the forest.", "那座老房子坐落在森林边缘。"],
  ["We should keep the original title and URL.", "我们应保留原始标题和网址。"],
  ["He promised to explain everything later.", "他答应稍后解释一切。"],
  ["The captain gave a signal, and the ship moved.", "船长发出信号，船就移动了。"],
  ["This is only a short phrase.", "这只是一条短语。"],
  ["The modern reader may find the sentence formal.", "现代读者可能会觉得这个句子很正式。"],
  ["No one knew the reason for the delay.", "没有人知道延误的原因。"],
  ["She placed the book beside the lamp.", "她把书放在灯旁边。"],
  ["The final chapter begins with a question.", "最后一章以一个问题开头。"],
  ["The instructions contain no hidden conditions.", "说明中不包含隐藏条件。"],
  ["He looked at the map, then smiled.", "他看了看地图，然后笑了。"],
  ["The museum is closed on Mondays.", "博物馆星期一闭馆。"],
  ["A careful translation preserves the whole meaning.", "准确的翻译会保留完整含义。"],
] as const;

describe("Qwen translation quality baseline contract", () => {
  it("keeps a 30-item public-domain/synthetic baseline in the test suite", () => {
    expect(BASELINE).toHaveLength(30);
    for (const [source, expected] of BASELINE) {
      expect(normalizeTranslationInput(source)).toBe(source);
      expect(assessTranslationQuality(source, expected)).toMatchObject({ ok: true });
    }
  });
});
