PS D:\skripsi\capstone-project\frontend> git status 
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   ../backend/controllers/staffController.js
        modified:   ../backend/jobs/periodeCron.js
        modified:   ../backend/routes/staffRoutes.js

no changes added to commit (use "git add" and/or "git commit -a")
PS D:\skripsi\capstone-project\frontend> git status
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
        modified:   ../backend/controllers/staffController.js
        modified:   ../backend/jobs/periodeCron.js
        modified:   ../backend/routes/staffRoutes.js

no changes added to commit (use "git add" and/or "git commit -a")
PS D:\skripsi\capstone-project\frontend> git diff --stat
 backend/controllers/staffController.js |  10 ----
 backend/jobs/periodeCron.js            | 101 ++++++++++++++++-----------------
 backend/routes/staffRoutes.js          |  27 +--------
 3 files changed, 52 insertions(+), 86 deletions(-)
PS D:\skripsi\capstone-project\frontend> ls -la .git
Get-ChildItem : A parameter cannot be found that matches parameter name 'la'.
At line:1 char:4
+ ls -la .git
+    ~~~
    + CategoryInfo          : InvalidArgument: (:) [Get-ChildItem], ParameterBindingException
    + FullyQualifiedErrorId : NamedParameterNotFound,Microsoft.PowerShell.Commands.GetChildItemCommand
 
PS D:\skripsi\capstone-project\frontend> pwd

Path                                
----                                
D:\skripsi\capstone-project\frontend


PS D:\skripsi\capstone-project\frontend> 