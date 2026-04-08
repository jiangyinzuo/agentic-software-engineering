gdb打印某oid对应的类型
p format_type_be(oid)

查看pg会把23当作什么类型
select pg_typeof(23)

查看thread local变量

找到#11 0x000056530be53387 in internal_thread_func (args=0x7f6e399f8c38)所在frame，

t_thrd全局变量

`p ((knl_thrd_context*)thr_argv->t_thrd)->postgres_cxt`

u_sess全局变量

`p ((knl_thrd_context*)thr_argv->t_thrd)->fake_session->utils_cxt.ActiveSnapshot`
