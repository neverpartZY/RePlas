<template>
  <view class="demand-form">
    <view class="form-group">
      <text class="form-label">角色类型 <text class="required">*</text></text>
      <picker
        mode="selector"
        :range="roles"
        :value="roleIndex"
        @change="onRoleChange"
      >
        <view class="picker-input" :class="{ placeholder: !form.role }">
          {{ form.role || '请选择角色' }}
          <text class="picker-arrow">▼</text>
        </view>
      </picker>
    </view>

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
      <text class="form-label">企业名称 <text class="required">*</text></text>
      <input
        class="form-input"
        v-model="form.company"
        placeholder="请输入企业名称"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">技术要求/形态</text>
      <input
        class="form-input"
        v-model="form.techSpecs"
        placeholder="如：瓶片，要求干净无标签"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">月需求量（吨） <text class="required">*</text></text>
      <input
        class="form-input"
        type="digit"
        v-model="form.monthlyVolume"
        placeholder="请输入月需求量"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">预算单价（元/吨） <text class="required">*</text></text>
      <input
        class="form-input"
        type="digit"
        v-model="form.budget"
        placeholder="请输入预算单价"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">应用领域</text>
      <input
        class="form-input"
        v-model="form.application"
        placeholder="如：化纤、注塑、吹膜"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-group">
      <text class="form-label">所在地 <text class="required">*</text></text>
      <input
        class="form-input"
        v-model="form.location"
        placeholder="如：浙江省杭州市"
        placeholder-style="color: #CCC"
      />
    </view>

    <view class="form-actions">
      <view class="submit-btn" @tap="onSubmit">
        <text>发布需求</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      roles: ['回收商', '造粒厂', '塑料制品厂', '化纤厂', '贸易商', '其他'],
      categories: [
        'PET瓶片', 'HDPE', 'PP', 'LDPE',
        'ABS', 'PS', 'PC', 'PA', 'PVC',
        '废塑料', '膜', '注塑料', '工程塑料'
      ],
      roleIndex: -1,
      categoryIndex: -1,
      form: {
        role: '',
        category: '',
        company: '',
        techSpecs: '',
        monthlyVolume: '',
        budget: '',
        application: '',
        location: ''
      }
    };
  },
  methods: {
    onRoleChange(e) {
      this.roleIndex = e.detail.value;
      this.form.role = this.roles[this.roleIndex];
    },
    onCategoryChange(e) {
      this.categoryIndex = e.detail.value;
      this.form.category = this.categories[this.categoryIndex];
    },
    validate() {
      if (!this.form.role) {
        uni.showToast({ title: '请选择角色类型', icon: 'none' });
        return false;
      }
      if (!this.form.category) {
        uni.showToast({ title: '请选择废塑料品类', icon: 'none' });
        return false;
      }
      if (!this.form.company.trim()) {
        uni.showToast({ title: '请填写企业名称', icon: 'none' });
        return false;
      }
      if (!this.form.monthlyVolume || parseFloat(this.form.monthlyVolume) <= 0) {
        uni.showToast({ title: '请输入有效月需求量', icon: 'none' });
        return false;
      }
      if (!this.form.budget || parseFloat(this.form.budget) <= 0) {
        uni.showToast({ title: '请输入有效预算单价', icon: 'none' });
        return false;
      }
      if (!this.form.location.trim()) {
        uni.showToast({ title: '请填写所在地', icon: 'none' });
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
        role: '',
        category: '',
        company: '',
        techSpecs: '',
        monthlyVolume: '',
        budget: '',
        application: '',
        location: ''
      };
      this.roleIndex = -1;
      this.categoryIndex = -1;
    }
  }
};
</script>

<style lang="scss" scoped>
.demand-form {
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
  background: linear-gradient(135deg, #1677FF, #0958D9);
  border-radius: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
  font-weight: 600;
  color: #FFFFFF;
  box-shadow: 0 8rpx 24rpx rgba(22, 119, 255, 0.3);
  transition: all 0.2s;
}
</style>
