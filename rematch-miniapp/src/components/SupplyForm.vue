<template>
  <view class="supply-form">
    <view class="form-group">
      <text class="form-label">废塑料品类 <text class="required">*</text></text>
      <picker
        mode="selector"
        :range="categories"
        :value="categoryIndex"
        @change="onCategoryChange"
      >
        <view class="picker-input" :class="{ placeholder: !form.category }">
          {{ form.category || '请选择品类' }}
          <text class="picker-arrow">▼</text>
        </view>
      </picker>
    </view>

    <view class="form-group">
      <text class="form-label">废塑料形态 <text class="required">*</text></text>
      <picker
        mode="selector"
        :range="forms"
        :value="formIndex"
        @change="onFormChange"
      >
        <view class="picker-input" :class="{ placeholder: !form.form }">
          {{ form.form || '请选择形态' }}
          <text class="picker-arrow">▼</text>
        </view>
      </picker>
    </view>

    <view class="form-group">
      <text class="form-label">数量（吨） <text class="required">*</text></text>
      <input
        class="form-input"
        type="digit"
        v-model="form.quantity"
        placeholder="请输入数量"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">单价（元/吨） <text class="required">*</text></text>
      <input
        class="form-input"
        type="digit"
        v-model="form.price"
        placeholder="请输入单价"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">发货地 <text class="required">*</text></text>
      <input
        class="form-input"
        v-model="form.location"
        placeholder="如：广东省深圳市"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">规格说明</text>
      <input
        class="form-input"
        v-model="form.specs"
        placeholder="如：蓝白瓶片，干净无杂质"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">备注</text>
      <textarea
        class="form-textarea"
        v-model="form.notes"
        placeholder="请输入其他补充说明"
        placeholder-style="color: #CCC"
        maxlength="500"
      />
      <text class="char-count">{{ form.notes.length }}/500</text>
    </view>

    <view class="form-actions">
      <view class="submit-btn" @tap="onSubmit">
        <text>发布供应</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      categories: [
        'PET瓶片', 'HDPE', 'PP', 'LDPE',
        'ABS', 'PS', 'PC', 'PA', 'PVC',
        '废塑料', '膜', '注塑料', '工程塑料'
      ],
      forms: [
        '瓶片', '颗粒', '破碎料', '废塑料',
        '膜', '注塑料', '工程塑料'
      ],
      categoryIndex: -1,
      formIndex: -1,
      form: {
        category: '',
        form: '',
        quantity: '',
        price: '',
        location: '',
        specs: '',
        notes: ''
      }
    };
  },
  methods: {
    onCategoryChange(e) {
      this.categoryIndex = e.detail.value;
      this.form.category = this.categories[this.categoryIndex];
    },
    onFormChange(e) {
      this.formIndex = e.detail.value;
      this.form.form = this.forms[this.formIndex];
    },
    validate() {
      if (!this.form.category) {
        uni.showToast({ title: '请选择废塑料品类', icon: 'none' });
        return false;
      }
      if (!this.form.form) {
        uni.showToast({ title: '请选择废塑料形态', icon: 'none' });
        return false;
      }
      if (!this.form.quantity || parseFloat(this.form.quantity) <= 0) {
        uni.showToast({ title: '请输入有效数量', icon: 'none' });
        return false;
      }
      if (!this.form.price || parseFloat(this.form.price) <= 0) {
        uni.showToast({ title: '请输入有效价格', icon: 'none' });
        return false;
      }
      if (!this.form.location.trim()) {
        uni.showToast({ title: '请输入发货地', icon: 'none' });
        return false;
      }
      return true;
    },
    onSubmit() {
      if (!this.validate()) return;
      this.$emit('submit', { ...this.form });
    },
    resetForm() {
      this.form = {
        category: '',
        form: '',
        quantity: '',
        price: '',
        location: '',
        specs: '',
        notes: ''
      };
      this.categoryIndex = -1;
      this.formIndex = -1;
    }
  }
};
</script>

<style lang="scss" scoped>
.supply-form {
  padding: 24rpx;
}

.form-group {
  margin-bottom: 28rpx;
}

.form-label {
  font-size: 28rpx;
  font-weight: 500;
  color: #1A1A1A;
  display: block;
  margin-bottom: 12rpx;
}

.required {
  color: #FA5151;
}

.form-input {
  width: 100%;
  height: 88rpx;
  border: 2rpx solid #E5E5E5;
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #1A1A1A;
  background: #FFFFFF;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #07C160;
  }
}

.form-textarea {
  width: 100%;
  min-height: 160rpx;
  border: 2rpx solid #E5E5E5;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  color: #1A1A1A;
  background: #FFFFFF;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #07C160;
  }
}

.char-count {
  text-align: right;
  font-size: 22rpx;
  color: #CCC;
  margin-top: 8rpx;
  display: block;
}

.picker-input {
  width: 100%;
  height: 88rpx;
  border: 2rpx solid #E5E5E5;
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #1A1A1A;
  background: #FFFFFF;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;

  &.placeholder {
    color: #CCC;
  }
}

.picker-arrow {
  font-size: 20rpx;
  color: #999;
}

.form-actions {
  padding: 32rpx 0 16rpx;
}

.submit-btn {
  width: 100%;
  height: 96rpx;
  background: linear-gradient(135deg, #07C160, #05A24B);
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 600;
  color: #FFFFFF;
  box-shadow: 0 8rpx 24rpx rgba(7, 193, 96, 0.3);
  transition: all 0.2s;
}
</style>
