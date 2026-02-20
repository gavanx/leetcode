所谓灵神，指的是leetcode上的超级大牛，他写了很多易读易理解的题解，是很多同学的算法领路人。
他还提供了很全的分类题单，我在刷的过程中遇到一些小的痛点，就vibe coding了几个插件。
## 1. （灵神题单）不知道哪些做过，哪些没做过，总体题数
我做了leetcode-discuss-solved-marker这个，它会在这样https://leetcode.cn/discuss/post/3578981/ti-dan-hua-dong-chuang-kou-ding-chang-bu-rzz7/ 的题单页面标记你的刷新状态。

插件不存任何token，用的是你的本地cookie缓存，结果如下图：

<img width="311" height="268" alt="image" src="https://github.com/user-attachments/assets/a25ae7a9-c4bb-4b2f-80a4-bccb77847c86" />
<img width="116" height="102" alt="image" src="https://github.com/user-attachments/assets/006fe468-a6c5-4a28-9b20-c62f67082526" />

1. 标记和暗显已完成的
2. 标记小于1600难度评分的，并高亮显示（没有做配置，可以clone项目后手动改分值上限）
3. 右图显示汇总数据情况
4. 没有写分数的，补全了一些分数，如1652题


另外，这个插件对这个赛题汇总页也做了标记，效果如下

<img width="414" height="247" alt="image" src="https://github.com/user-attachments/assets/7ef60583-4b8d-497b-a132-d454436f0e3d" />


数据有一定的缓存（应该是12小时），以减少网络请求，基本够用。

右下角的汇总面板上有刷新按钮，可以手动刷新。（当然，我还没用过，还不需要，有bug请反馈）

## 2. （官方题单）经典面试题单略长，不想看已通过的题目
我在做官方的两个题单https://leetcode.cn/studyplan/top-interview-150/ ，完成了大部分，已完成的我又不想看，放那又占空间，于是做了leetcode-row-filter-extension这个插件，把已完成的隐藏。

效果如下：

<img width="373" height="232" alt="image" src="https://github.com/user-attachments/assets/c3044b97-cb04-4790-afaa-ddbb9efe3ae1" />


## 3. 本地vscode里写了代码，需要测试用例，不想写用例代码及数据
我习惯本地vscode里写代码，测试用例如果是很长的数组，需要反复对照。

于是写了leetcode-test-helper这个插件，帮我生成js测试代码（包含题目页上的测试用例数据）。

安装后点击页面右下角的按钮，会生成代码，并复制到剪贴板。这时候再去vscode里paste就行

<img width="228" height="105" alt="image" src="https://github.com/user-attachments/assets/e56ffc79-7aaf-4b23-b920-0a404046eab3" />


生成代码样例如下：

<img width="275" height="145" alt="image" src="https://github.com/user-attachments/assets/cbc8514d-3a21-4c3a-a399-9502db84a8ee" />


执行后输出如下：

<img width="285" height="43" alt="image" src="https://github.com/user-attachments/assets/b2d34097-f06f-467f-a2ca-71790220b12d" />


PS：
- 本人是前端，所以只生成了js代码
- 函数名从右侧的输入框内的内容获取，当前在右侧没有高亮选中时能正常获取

## 4. 随便打开一个题目页，不知道题目估分
如题，写了这个插件leetcode-rating-badge-extension，在难度后加上估分（如果有）

<img width="125" height="55" alt="image" src="https://github.com/user-attachments/assets/ec1f5daf-8cf1-4eef-bcd0-45ce0ae034cd" />


## 插件安装
当前没有打包，没有发布，需clone项目后本地安装。（有需要请联系我）

<img width="718" height="74" alt="image" src="https://github.com/user-attachments/assets/3f5159b7-10b5-48c8-ac12-fa79a12b16f8" />


如果觉得有用，请star or 打赏。

<img width="230" height="230" alt="image" src="https://github.com/user-attachments/assets/84f8e44f-8b35-40b8-aeb7-812223043a70" />


如果有问题，请提issue联系。
