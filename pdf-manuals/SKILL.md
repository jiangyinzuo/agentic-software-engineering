---
name: pdf-manuals
description: 项目手册，PDF转换成txt文件，可供查阅
---

项目的PDF手册及其通过脚本转换的txt文件保存在指定文件夹。

如果用户没有说明手册位置，请向用户确认手册所在文件夹。

如果手册文件夹中只有pdf文件，没有txt文件，使用pdftotext_with_pages.sh脚本转换:
```bash
pdftotext_with_pages.sh a.pdf
```

运行后会在同一目录输出 a.txt。这个脚本是对pdftotext的简单封装，它会在每一个pdf的Page开头插入"=== Page xxx ==="，方便检索。
PDF转换成txt后，你可以根据用户请求针对性地检索txt文件。
