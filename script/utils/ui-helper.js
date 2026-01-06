export function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    // 设置通知样式
    notification.className = 'fixed top-4 right-4 p-4 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    
    // 根据类型设置不同的样式
    if (type === 'success') {
        notification.classList.add('bg-green-500', 'text-white');
    } else if (type === 'error') {
        notification.classList.add('bg-red-500', 'text-white');
    } else if (type === 'warning') {
        notification.classList.add('bg-yellow-500', 'text-white');
    } else {
        notification.classList.add('bg-blue-500', 'text-white');
    }
    
    // 设置通知内容
    notification.innerHTML = `
        <div class="flex items-center">
            ${getIconForType(type)}
            <span class="ml-2">${message}</span>
        </div>
    `;
    
    // 显示通知
    notification.classList.remove('opacity-0', 'translate-y-[-20px]');
    
    // 3秒后隐藏通知
    setTimeout(() => {
        notification.classList.add('opacity-0', 'translate-y-[-20px]');
    }, 3000);
}

// 根据通知类型获取图标
function getIconForType(type) {
    if (type === 'success') {
        return '<i class="fa fa-check-circle"></i>';
    } else if (type === 'error') {
        return '<i class="fa fa-exclamation-circle"></i>';
    } else if (type === 'warning') {
        return '<i class="fa fa-exclamation-triangle"></i>';
    } else {
        return '<i class="fa fa-info-circle"></i>';
    }
}    