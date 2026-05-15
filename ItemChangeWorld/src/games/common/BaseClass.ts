function _create_single_instance<T>(this: { new(): T }): T {
	'use strict';
	if (!this) return undefined;
	if ((this as any) === BaseClass) throw new Error('can not call BaseClass::ins()');
	if (this.hasOwnProperty('ins')) {
		const f = (this as any).ins;
		if (f !== _create_single_instance)
			return (this as any).ins();
	}
	const thiz = this;
	const instance = new this();
	const f = () => {
		if (this === thiz) return instance;
		return this && _create_single_instance.call(this) || undefined;
	};
	(this as any).ins = f;
	return instance;
}

export abstract class BaseClass {
	/**获取单例 */
	public static readonly ins = _create_single_instance;
}